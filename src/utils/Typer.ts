import { Channel, TextChannel, DMChannel, NewsChannel, Emoji, GuildEmojiManager } from "discord.js";

type TypeTextInit = {
    channel: TextChannel | DMChannel | NewsChannel,
    text: string,
    typeDuration?: number,
    prepareTime?: number
}

export class Typer {
    public static typeText(init: TypeTextInit): Promise<void> {
        return new Promise((resolve, _) => {
            var config: any = {};
            var chn = init.channel;
    
            if(!config.isTypeDelayEnabled()) {
                chn.send(init.text);
                resolve();
                return;
            }

            var textCounter = init.text;
            textCounter = textCounter.replace(/<:[\w]+:[\d]+>/g, "x");
            textCounter = textCounter.replace(/:[\w]+:/g, "x");
    
            setTimeout(() => {
                chn.startTyping();
                setTimeout(() => {
                    chn.stopTyping();
                    chn.send(init.text);
                    resolve();
                }, init.typeDuration ?? textCounter.length / 5 * 1000);
            }, init.prepareTime ?? textCounter.length / 10 * 250 + 980);
        });
    }
}