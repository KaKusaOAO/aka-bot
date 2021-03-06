import { Logger } from "./utils/Logger";
import * as readline from "readline";
import { CommandNode, CommandDispatcher, Command, RootCommandNode, LiteralCommandNode, ArgumentCommandNode, CommandResult, CommandContext, ParseResults } from "./command/dispatcher"
import { CommandSource, ConsoleCommandSource, DiscordCommandSource, DiscordSlashSource, DiscordSource } from "./command/CommandSource"
import { FormatText, LiteralText, TextColor } from "./text/Text";
import { AkabotConfig } from "./AkabotConfig";
import { Client, DMChannel, Guild, GuildChannel, GuildMember, Message, MessageEmbed, MessageReaction, PartialUser, PermissionString, TextChannel, User } from "discord.js";
import { Typer } from "./utils/Typer";
import { Task } from "./utils/Task";
import * as cron from "node-cron";
import { throws } from "assert";
import { textChangeRangeIsUnchanged } from "typescript";
import { SlashPatch } from "./utils/SlashPatch";
import { BaseClient } from "discord.js";
import { OverwriteResolvable } from "discord.js";
import { OnDutyProvider, ProviderBase, TestProvider } from "./providers/providers";

export class Akabot {
    public logger: Logger;
    private in: readline.Interface;
    private dispatcher = new CommandDispatcher<CommandSource>();
    private commandQueue: ParseResults<CommandSource>[] = [];
    private queueInterval: NodeJS.Timeout;
    public config: AkabotConfig;
    public bot: Client;
    private static _instance: Akabot;
    private static readonly debugTest = false;

    private provider: ProviderBase;

    public activeTask: cron.CronTask | null = null;

    constructor() {
        Akabot._instance = this;
        this.logger = new Logger();
        this.logger.info("Akabot v1.0 is starting....");

        this.provider = Akabot.debugTest ? new TestProvider(this) : new OnDutyProvider(this);

        // Setup readline interface.
        this.in = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        var prompt = () => {
            this.in.question(">", answer => {
                try {
                    this.commandQueue.push(this.dispatcher.parse(answer, new ConsoleCommandSource(answer)));
                } catch(ex) {
                    if(ex instanceof Error) {
                        this.logger.error(ex.message);
                    }
                }
                prompt();
            });
        };
        prompt();

        this.queueInterval = setInterval(() => {
            var item = this.commandQueue.shift();
            if(item == null) return;

            var { command, node, context } = item;
            this.logger.info(
                FormatText.of("%s issued a command: %s")
                    .addWith(LiteralText.of(context.source.getName()).setColor(TextColor.gold))
                    .addWith(LiteralText.of(command).setColor(TextColor.gold))
            );
            var result = node?.run(context);
            if(result.error != null) {
                this.logger.error(result.error.message);
            }
        }, 10);

        this.registerCommands();

        this.config = new AkabotConfig();

        // Schedule the kick job.
        var schedule = this.config.getActiveSchedule();
        if(schedule) {
            this.scheduleTask(schedule);
        }

        // Setup Discord bot client.
        var token = this.config.getBotToken();
        if(token == "<insert token here>") {
            this.logger.error("The token is not set! Terminating the process...");
            process.exit(0);
        }

        this.bot = new Client({
            partials: [
                "MESSAGE", "CHANNEL", "REACTION", "GUILD_MEMBER"
            ]
        });
        SlashPatch.init(this.bot);
        this.initBotHandlers();
        
        try {
            this.bot.login(token);
        } catch(ex) {
            this.logger.error("Could not login with the given token! Terminating the process...");
            process.exit(0);
        }
    }

    public scheduleTask(time: string) {
        this.cancelTask();
        this.activeTask = cron.schedule(time, () => {
            this.kaboom();
            this.activeTask?.stop();
            this.config.data.activeSchedule = null;
            this.config.save();
        });
    }

    public getCheckerPermissionOverwrite(everyone: string, hideEv: boolean): OverwriteResolvable[] {
        var evp: OverwriteResolvable = {
            id: everyone
        };

        var deny: PermissionString[] = [
            "SEND_MESSAGES", "ADD_REACTIONS"
        ];

        if(hideEv) {
            deny = [
                ...deny,
                "VIEW_CHANNEL"
            ];
        }
        evp.deny = deny;

        return [
            evp,
            {
                id: "766819273107832840",
                allow: [
                    "VIEW_CHANNEL"
                ]
            },
            {
                id: this.config.getActiveRole(),
                deny: [
                    "VIEW_CHANNEL"
                ]
            }
        ];
    }

    /** Compact the inactive members. */
    public async kaboom() {
        this.logger.info("Started kaboom()...");
        if(Akabot.debugTest) {
            this.logger.info("-- Debug mode is activated. That means the bot should not perform any real actions. --");
        }

        var g = this.bot.guilds.cache.get(this.config.getGuildId());
        if(!g) {
            this.logger.error("Guild == null while kaboom()");
            return;
        }

        var chns = this.config.channels();
        var cm = this.config.getActiveCheckMsg();
        if(cm != null) {
            var checkerChn = g?.channels.resolve(chns.checker);
            if(checkerChn instanceof TextChannel) {
                var everyone = checkerChn.guild.roles.everyone.id;
                checkerChn.overwritePermissions(this.getCheckerPermissionOverwrite(everyone, true));
                if(cm != "<debug>") {
                    checkerChn.messages.delete(cm, "???????????????????????????????????????????????????????????????").finally(() => {});
                }
            }
        }

        var members = await g?.members.fetch();
        var count = 0;
        var kicked = 0;
        var pendKick: GuildMember[] = [];
        members?.forEach(m => {
            var shouldIgnore = false;
            
            if(m.user.bot || m.user.id == g?.ownerID) {
                // Ignore bots and server owner.
                return;
            }

            this.config.getIgnoredRoles().forEach(rid => {
                if(m.roles.cache.map(r => r.id).indexOf(rid) != -1) {
                    shouldIgnore = true;
                }
            });

            if(shouldIgnore) {
                return;
            }

            var toKick = false;

            const roles = m.roles.cache.map(r => r.id);
            if(roles.indexOf(this.config.getForceKickRole()) != -1) {
                toKick = true;
            }

            if(!toKick) {
                if(roles.indexOf(this.config.getActiveRole()) == -1) {
                    // Didn't have the active role.

                    // Check if this inactive member has the kick threshold role.
                    var kr = this.config.getKickThresholdRole();

                    if(roles.indexOf(kr) == -1) {
                        // Kick ones without that role.
                        toKick = true;
                    }

                    // Check if this inactive member will be kicked.
                    if(!toKick) {
                        // Remove the threshold role.
                        this.provider.removeRole(m, kr);
                    }
                    count++;
                } else {
                    // Remove the active role.
                    this.provider.removeRole(m, this.config.getActiveRole());
                }
            }

            if(toKick) {
                if(pendKick.indexOf(m) == -1) {
                    pendKick.push(m);
                }
            }
        });

        pendKick.forEach(async (m) => {
            var embed = new MessageEmbed();
            embed.color = 0xff7b51;
            embed.title = "???????????????????????????";
            embed.description = "????????????????????????????????????????????????????????????????????????????????????";

            const isForceKick = m.roles.cache.map(r => r.id).indexOf(this.config.getForceKickRole()) != -1;
            if(isForceKick) {
                embed.description += "\n????????????????????????????????????????????????????????????";
            }

            embed.setAuthor("????????????", g?.iconURL() ?? undefined);
            embed.addField("???????????????", "[??????](https://discord.gg/pWPNVqXRGy)");
            
            this.provider.sendToMember(m, { embed }).finally(() => {
                this.provider.kickMember(m, isForceKick ? "????????????????????????????????????????????????????????????" : "?????????????????????????????????????????????????????????");
            });
            kicked++;
        });

        this.logger.warn(`Cleared roles of ${count} members.`);
        this.logger.info("kaboom() done.");

        Task.run(async () => {
            var c = await g?.channels.resolve(chns.announcement);
            if(c instanceof TextChannel) {
                var embed = new MessageEmbed();
                embed.color = 0xff7b51;
                embed.title = "??????????????????";
                embed.description = "????????????????????????????????????????????????\n??????????????????????????????????????????????????????????????????";
                embed.setAuthor("????????????", g?.iconURL() ?? undefined);

                embed.addField("????????????", `${count}???`, true);
                embed.addField("????????????", `${kicked}???`, true);
                this.provider.sendToChannel(c, { embed });
            }
        });
    }

    public cancelTask() {
        if(this.activeTask) {
            this.activeTask.stop();
        }
    }

    public registerCommands() {
        var d = this.dispatcher;
        d.register(Command.of<CommandSource>("echo", RootCommandNode.create<CommandSource>()
            .addChild(
                LiteralCommandNode.of<CommandSource>("ping")
                    .addChild(
                        ArgumentCommandNode.of<CommandSource>("message").executes(c => {
                            this.logger.info(c.args.message);
                            return CommandResult.success();
                        })
                    ).executes(c => {
                        this.logger.info("Pong!");
                        return CommandResult.success();
                    })
            )
        ));

        d.register(Command.of<CommandSource>("exit", RootCommandNode.create<CommandSource>()
            .executes(c => {
                if(c.source instanceof ConsoleCommandSource) {
                    this.stop();
                    return CommandResult.success();
                }
                return CommandResult.error(new Error("Not permitted"));
            })
        ));

        d.register(Command.of<CommandSource>("reload", RootCommandNode.create<CommandSource>()
            .executes(c => {
                if(c.source instanceof ConsoleCommandSource) {
                    this.config.load();
                    this.updateActivity();
                    
                    var schedule = this.config.getActiveSchedule();
                    if(schedule) {
                        this.scheduleTask(schedule);
                    }

                    this.logger.info(
                        LiteralText.of("Configuration reloaded!").setColor(TextColor.green)
                    );
                    return CommandResult.success();
                }
                return CommandResult.error(new Error("Not permitted"));
            })
        ));

        d.register(Command.of<CommandSource>("help", RootCommandNode.create<CommandSource>()
            .executes(c => {
                if(c.source instanceof ConsoleCommandSource) {
                    d.registry.forEach(cmd => {
                        var usages = cmd.rootNode.toUsage();
                        this.logger.info("/" + cmd.name);

                        usages.forEach(u => {
                            this.logger.info("/" + cmd.name + " " + u);
                        });
                    });
                    return CommandResult.success();
                }
                return CommandResult.error(new Error("Not permitted"));
            })
        ));

        // Scheduler command
        d.register(Command.of<CommandSource>("kab", RootCommandNode.create<CommandSource>()
            .executes(c => {
                var args = c.rawCommand.substring(4);
                if(c.source instanceof DiscordSource) {
                    if(!c.source.getMember()?.hasPermission("KICK_MEMBERS")) {
                        return CommandResult.error(new Error("Not permitted"));
                    }
                }
                
                var spl = args.split(" ");
                var min = spl[3] ?? "0";
                var hr = spl[2] ?? "0";
                var day = spl[1];
                var month = spl[0];

                var chns = this.config.channels();

                // Announce
                Task.run(async () => {
                    var g = await this.bot.guilds.fetch(this.config.getGuildId());
                    var c = await g.channels.resolve(chns.announcement);
                    if(c instanceof TextChannel) {
                        const embed = this.getAnnounceEmbed();
                        const r = await this.provider.sendToChannel(c, {
                            embeds: [ embed ]
                        });
                        this.config.data.activeAnnounceMsg = r.id;
                    }

                    var c2 = await g.channels.resolve(chns.checker);
                    if(c2 instanceof TextChannel) {
                        var everyone = c2.guild.roles.everyone.id;
                        c2.overwritePermissions(this.getCheckerPermissionOverwrite(everyone, false));
                        const embed = this.getCheckerEmbed();

                        const msg = await this.provider.sendToChannel(c2, {
                            embeds: [ embed ], 
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 2,
                                            style: 2,
                                            label: "??????????????????",
                                            emoji: {
                                                name: "meme_phoque",
                                                id: "766825219306291231",
                                                animated: false
                                            },
                                            custom_id: "divecheck_pass",
                                        }
                                    ]
                                }
                            ]
                        });

                        var mind = min.length == 1 ? "0" + min : min;

                        // Set the topic
                        this.provider.setChannelTopic(c2, `${month}???${day}??? ${hr}:${mind} ??????`, "?????????????????????");

                        // Store the checker message by Snowflake.
                        this.config.data.activeCheckMsg = msg.id;
                    }
                    this.config.save();
                });

                var schedule = `${min} ${hr} ${day} ${month} *`;
                this.scheduleTask(schedule);

                this.config.data.activeSchedule = schedule;
                this.config.save();
                this.logger.info(args);
                return CommandResult.success();
            })
        ));

        d.register(Command.of<CommandSource>("cancel", RootCommandNode.create<CommandSource>()
            .executes(c => {
                if(c.source instanceof DiscordCommandSource) {
                    if(!c.source.getMember()?.hasPermission("KICK_MEMBERS")) {
                        return CommandResult.error(new Error("Not permitted"));
                    }
                }

                this.cancelTask();
                this.config.data.activeSchedule = null;
                this.config.save();
                return CommandResult.success();
            })
        ));
        
        d.register(Command.of<CommandSource>("update", RootCommandNode.create<CommandSource>()
            .executes(c => {
                if(c.source instanceof DiscordCommandSource) {
                    if(!c.source.getMember()?.hasPermission("KICK_MEMBERS")) {
                        return CommandResult.error(new Error("Not permitted"));
                    }
                }

                Task.run(async () => {
                    var g = await this.bot.guilds.fetch(this.config.getGuildId());
                    var chns = this.config.data.channels;
                    var c = await g.channels.resolve(chns.announcement) as TextChannel;
                    var c2 = await g.channels.resolve(chns.checker) as TextChannel;
                    const announceMsg = this.config.getActiveAnnounceMsg()!!;
                    const checkerMsg = this.config.getActiveCheckMsg()!!;
                    const aEmbed = this.getAnnounceEmbed();
                    const cEmbed = this.getCheckerEmbed();

                    this.provider.editMessageAt(c, announceMsg, {
                        embeds: [ aEmbed ]
                    });
                    this.provider.editMessageAt(c2, checkerMsg, {
                        embeds: [ cEmbed ]
                    });

                    var spl = this.config.getActiveSchedule()?.split(" ");
                    if(!spl) spl = ["0","0","0","0"];
            
                    var min = spl[0];
                    var mind = min.length == 1 ? "0" + min : min;
                    var hr = spl[1];
                    var day = spl[2];
                    var month = spl[3];

                    this.provider.setChannelTopic(c2, `${month}???${day}??? ${hr}:${mind} ??????`, "?????????????????????");
                });

                return CommandResult.success();
            })
        ));
    }

    public getDateTimeDetails() {
        var spl = this.config.getActiveSchedule()?.split(" ");
        if(!spl) spl = ["0","0","0","0"];

        var min = spl[0];
        var mind = min.length == 1 ? "0" + min : min;
        var hr = spl[1];
        var day = spl[2];
        var month = spl[3];

        return {
            min, minD: mind, hour: hr, day, month
        };
    }    

    public getEmbedBase(): MessageEmbed {
        var g = this.bot.guilds.cache.get(this.config.getGuildId());
        return new MessageEmbed()
            .setColor(0xff7b51)
            .setAuthor("????????????", g?.iconURL() ?? undefined);
    }

    public getCheckerEmbed() {
        const {
            minD: mind, hour: hr, day, month
        } = this.getDateTimeDetails();
        
        var embed = this.getEmbedBase();
        embed.title = "????????????";
        embed.description = "??????????????????????????????????????????????????????????????????????????????????????????????????????\n?????????????????????????????????????????????";
        embed.addField("????????????", `${month}???${day}??? ${hr}:${mind}`);
        return embed;
    }

    public getAnnounceEmbed() {
        const {
            minD: mind, hour: hr, day, month
        } = this.getDateTimeDetails();
                    
        var embed = this.getEmbedBase();
        embed.title = "?????????????????????";
        embed.description = "????????? <#769009862323208224> ?????????????????????????????????????????????????????????\n?????????????????????????????????????????????";
        embed.addField("?????????????????????????????????", this.config.getIgnoredRoles().map(r => `<@&${r}>`).join("\n"));
        embed.addField("????????????", `${month}???${day}??? ${hr}:${mind}`);
        return embed;
    }

    public updateActivity() {
        this.bot.user?.setPresence({
            activity: {
                type: "PLAYING",
                name: Akabot.debugTest ? "???????????????" : this.config.getStatus()
            }
        });
    }

    public initBotHandlers() {
        this.bot.on("ready", async() => {
            this.logger.info(
                FormatText.of("Logged into the Discord API as bot %s.")
                    .addWith(LiteralText.of(this.bot.user?.tag ?? "(unknown)").setColor(TextColor.gold))
            );
            this.updateActivity();

            var g = await this.bot.guilds.fetch(this.config.getGuildId());
            
            Task.run(async () => {
                this.logger.info("Fetching the guild members...");
                this.logger.info(`The guild has ${g?.memberCount ?? 0} member(s)`);
                g?.members.fetch().then(_ => {
                    this.logger.info("Cached the guild members.");
                }).catch(_ => {
                    this.logger.warn("Failed to fetch the guild members!!");
                });
            });

            var chns = this.config.channels();
            var cm = this.config.getActiveCheckMsg();
            if(cm != null) {
                var checkerChn = g?.channels.resolve(chns.checker);
                if(checkerChn instanceof TextChannel) {
                    var everyone = checkerChn.guild.roles.everyone.id;
                    checkerChn.overwritePermissions(this.getCheckerPermissionOverwrite(everyone, this.config.getActiveSchedule() == null));
                }
            }

            // Update slash commands
            // @ts-ignore
            var api = this.bot.api.applications(this.config.data.appId).guilds(g?.id).commands;
            await api.post({
                data: {
                    name: "kab",
                    description: "Schedule an event to clean up inactive members.",
                    options: [
                        {
                            name: "month",
                            description: "The month of the event.",
                            type: 4,
                            required: true
                        },
                        {
                            name: "date",
                            description: "The date of the event.",
                            type: 4,
                            required: true
                        },
                        {
                            name: "hour",
                            description: "The hour of the event.",
                            type: 4,
                            required: false
                        },
                        {
                            name: "minute",
                            description: "The minute of the event.",
                            type: 4,
                            required: false
                        }
                    ]
                }
            });
            await api.post({
                data: {
                    name: "cancel",
                    description: "Cancel the scheduled event."
                }
            });
            await api.post({
                data: {
                    name: "update",
                    description: "Update the ongoing anonunce embed message."
                }
            });
            this.logger.info("Slash commands has been setup!");
        });

        this.bot.on("message", msg => {
            this.handleMessage(msg);
        });
        this.bot.on("messageReactionAdd", (reaction, user) => {
            this.handleReactionAdd(reaction, user);
        });

        this.bot.on("interactionCreate", async (interaction) => {
            if(interaction.type == 3) {
                const customId = interaction.data.custom_id;
                if(customId == "divecheck_pass" && interaction.message.id == this.config.getActiveCheckMsg()) {
                    // Member info
                    var sender = {
                        id: interaction.member.user.id,
                        name: interaction.member.user.username,
                        nick: interaction.member.nick,
                        tag: interaction.member.user.discriminator,
                        avatar: `https://cdn.discordapp.com/avatars/${interaction.member.user.id}/${interaction.member.user.avatar}?size=128`,
                        mention: `<@${interaction.member.user.id}>`,
                        nickedMention: `<@!${interaction.member.user.id}>`,
                        taggedName(){
                            return `${interaction.member.user.username}#${interaction.member.user.discriminator}`;
                        },
                        namePreferNick() {
                            return sender.nick ?? sender.name;
                        },
                        author() {
                            return {
                                name: sender.name,
                                icon_url: sender.avatar
                            };
                        },
                        authorNicked() {
                            return {
                                name: sender.namePreferNick(),
                                icon_url: sender.avatar
                            };
                        },
                        authorTagged() {
                            return {
                                name: sender.taggedName(),
                                icon_url: sender.avatar
                            };
                        }
                    };

                    this.logger.info(
                        FormatText.of("%s pressed the divecheck_pass button.")
                            .addWith(
                                LiteralText.of(sender.taggedName())
                                .setColor(TextColor.gold)
                            )
                    );
                    var g = await this.bot.guilds.fetch("766819273087647754");
                    var ml = await g.members.fetch();

                    var cloud = await ml.get("715436359778828308");
                    var m = await ml.get(sender.id);

                    if(!m) {
                        this.logger.error(`Member with ID ${sender.id} not found?`);
                        return;
                    }

                    var hasRes = m.roles.cache.map(r => r.id).indexOf("766819273087647761") != -1;
                    if(!hasRes) {
                        this.logger.warn(
                            FormatText.of("%s doesn't have the resident role!")
                                .addWith(
                                    LiteralText.of(sender.taggedName())
                                    .setColor(TextColor.gold)
                                )
                        );
                    }

                    // Respond the interaction here.
                    var embed = new MessageEmbed();
                    embed.color = 0xff7b51;
                    embed.title = hasRes ? "?????????" : "??????????????????????????????";
                    embed.description = hasRes ?
                        // "?????????????????????????????????????????????(????????????)???"
                        "???????????????????????????????????????"
                        : "????????? <#766819273137455118> ???????????????????????????????????????????????????";

                    var footer = hasRes ? {
                        text: "?????????????????? by??????",
                        icon_url: cloud?.user.avatarURL()
                    } : null;

                    var alreadyChecked = m.roles.cache.map(r => r.id).indexOf(this.config.getActiveRole()) != -1;
                    if(alreadyChecked) {
                        embed.title = "????????????????????????";
                        embed.description = "???????????????????????????";
                        footer = null;
                    }

                    // @ts-ignore
                    const api: any = this.bot.api;
                    await api.interactions(interaction.id, interaction.token).callback.post({
                        data: {
                            type: 4,
                            data: {
                                flags: 64,
                                embeds: [
                                    {
                                        color: embed.color,
                                        title: embed.title,
                                        description: embed.description,
                                        author: sender.author(),
                                        timestamp: new Date().toISOString(),
                                        // footer
                                    }
                                ]
                            }
                        }
                    });

                    // Give him the role.
                    if(hasRes && !alreadyChecked) {
                        var r = await g.roles.fetch(this.config.getActiveRole());
                        if(r) {
                            m?.roles.add(r, "?????????????????????????????????").then(async (_) => {
                                var cid = this.config.channels().logger;
                                if(!cid) return;

                                var c = await g.channels.resolve(cid);
                                if(c instanceof TextChannel) {
                                    var e2 = new MessageEmbed();
                                    e2.setColor(0xff7b51)
                                        .setTitle("??????????????????")
                                        .addField("??????", `${sender.mention}\n${sender.id}`, true)
                                        .setTimestamp(new Date());
                                    e2.author = sender.authorTagged();
                                    this.provider.sendToChannel(c, { embed: e2 });
                                }
                            });
                        }
                    }
                }
            } else if(interaction.type == 2) {
                const name = interaction.data.name;
                const args = interaction.data.options?.map((o: any) => o.value.toString()).join(" ") ?? "";
                const cmd = (name + " " + args).trim();

                const source = new DiscordSlashSource(this.bot, interaction);
                await source.init();
                this.commandQueue.push(this.dispatcher.parse(cmd, source));
                
                // @ts-ignore
                const api: any = this.bot.api;
                api.interactions(interaction.id, interaction.token).callback.post({
                    data: {
                        type: 4,
                        data: {
                            flags: 64,
                            content: "Queued your command!"
                        }
                    }
                });
            }
        });
    }

    public handleMessage(msg: Message) {
        if(msg.author.id == this.bot.user?.id && !this.config.isSelfInvokeAllowed()) return;

        if(msg.content.startsWith("a%")) {
            try {
                this.commandQueue.push(this.dispatcher.parse(msg.content.substring(2), new DiscordCommandSource(msg)));
            } catch(ex) {
                if(ex instanceof Error) {
                    this.logger.warn("Exception occurred: " + ex.message);
                }
            }
        }
        if(msg.channel instanceof DMChannel) return;
        if(msg.member?.roles.cache.map(r => r.id).indexOf(this.config.getForceKickRole()) == -1) return;
        if(this.config.getValidChannels().indexOf(msg.channel.id) == -1) {
            this.logger.info("Force kick pending member " + msg.author.tag
                + " is sending messages to ignored channel " + msg.channel.name + " (#" + msg.channel.id + ")");
            return;
        }

        if(this.config.getLockedForceKickMembers().indexOf(msg.author.id) == -1) {
            this.provider.removeRole(msg.member!!, this.config.getForceKickRole());
            this.logger.info("Removed force kick role from " + msg.author.tag);
        } else {
            this.logger.info("Cannot remove force kick role from " + msg.author.tag + " because it is locked.");
        }
    }

    public async handleReactionAdd(reaction: MessageReaction, user: User | PartialUser) {

    }

    public start() {
        
    }

    public stop() {
        this.logger.info("Stopping Akabot...");
        this.bot.destroy();
        this.in.close();
        clearInterval(this.queueInterval);
        process.exit();
    }

    public static getInstance(): Akabot {
        if(Akabot._instance == null) {
            Akabot._instance = new Akabot();
        }
        return Akabot._instance;
    }
}