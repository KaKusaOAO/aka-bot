type CommandExecutor<S> = (context: CommandContext<S>) => CommandResult

export abstract class CommandNode<S, T extends CommandNode<S, T>> {
    public children: CommandNode<S, any>[] = [];
    public run: CommandExecutor<S> = _ => CommandResult.error(new Error("Command not found"));
    private defRun: boolean = true;

    public addChild(node: CommandNode<S, any>): T {
        this.children.push(node);
        return this.resolveThis();
    }

    public executes(executor: CommandExecutor<S>) {
        this.defRun = false;
        this.run = executor;
        return this.resolveThis();
    }

    public isDefaultBehavior(): boolean {
        return this.defRun;
    }

    protected abstract resolveThis(): T

    public findLiteralChild(name: string): LiteralCommandNode<S> | null {
        for(var i=0; i<this.children.length; i++) {
            var node = this.children[i];
            if(node instanceof LiteralCommandNode) {
                if(node.literal == name) return node;
                node.aliases.forEach(a => {
                    if(a == name) return node;
                });
            }
        }
        return null;
    }

    public findFirstArgumentChild(): ArgumentCommandNode<S> | null {
        for(var i=0; i<this.children.length; i++) {
            var node = this.children[i];
            if(node instanceof ArgumentCommandNode) return node; 
        }
        return null;
    }

    public toUsage(): string[] {
        var result: string[] = [];
        this.children.forEach(c => {
            result = result.concat(c.toUsage());
        });
        return result;
    }
}

export class LiteralCommandNode<S> extends CommandNode<S, LiteralCommandNode<S>> {
    public literal: string;
    public aliases: string[];

    public constructor(literal: string, aliases: string[] = []) {
        super();
        this.literal = literal;
        this.aliases = aliases;
    }

    protected resolveThis(): LiteralCommandNode<S> {
        return this;
    }

    public static of<S>(literal: string): LiteralCommandNode<S> {
        return new LiteralCommandNode<S>(literal);
    }

    public toUsage(): string[] {
        var results = super.toUsage();
        var arr: string[] = [];
        return arr.concat([this.literal], this.aliases).concat(results.map(s => {
            return this.literal + " " + s;
        }));
    }
}

export class ArgumentCommandNode<S> extends CommandNode<S, ArgumentCommandNode<S>> {
    public name: string;
    
    public constructor(name: string) {
        super();
        this.name = name;
    }

    protected resolveThis(): ArgumentCommandNode<S> {
        return this;
    }

    public static of<S>(name: string): ArgumentCommandNode<S> {
        return new ArgumentCommandNode<S>(name);
    } 

    public toUsage(): string[] {
        var results = super.toUsage();
        return ["<" + this.name + ">"].concat(results.map(s => {
            return "<" + this.name + "> " + s;
        }));
    }
}

export class RootCommandNode<S> extends CommandNode<S, RootCommandNode<S>> {
    public constructor() {
        super();
    }

    protected resolveThis(): RootCommandNode<S> {
        return this;
    }

    public static create<S>(): RootCommandNode<S> {
        return new RootCommandNode<S>();
    }
}

export class Command<S> {
    public rootNode: RootCommandNode<S>;
    public name: string;
    public aliases: string[];

    public constructor(name: string, rootNode: RootCommandNode<S>, aliases: string[] = []) {
        this.name = name;
        this.rootNode = rootNode;
        this.aliases = aliases;
    }

    public static of<S>(name: string, node: RootCommandNode<S>, aliases: string[] = []): Command<S> {
        return new Command<S>(name, node, aliases);
    }
}

export class ParseResults<S> {
    public command: string;
    public node: CommandNode<S, any>;
    public context: CommandContext<S>;

    public constructor(command: string, node: CommandNode<S, any>, context: CommandContext<S>) {
        this.command = command;
        this.node = node;
        this.context = context;
    }
}

export class CommandDispatcher<S> {
    public registry: Command<S>[] = [];

    public register(cmd: Command<S>) {
        this.registry.push(cmd);
    }

    public parse(cmd: string, source: S): ParseResults<S> {
        function lex(cmd: string) {
            var splits = cmd.split(" ");
            var result: string[] = [];
            var inQuote = false;
            for(var i=0; i<splits.length; i++) {
                var a = splits[i];
                if(inQuote) {
                    result[result.length - 1] += " " + a;
                    if(a.endsWith("\"")) {
                        var last = result[result.length - 1];
                        inQuote = false;
                        result[result.length - 1] = last.substring(1, last.length - 1);
                    }
                    continue;
                } else {
                    result.push(a);
                }

                if(!inQuote && a.startsWith("\"")) {
                    inQuote = true;
                    
                    if(a.endsWith("\"")) {
                        var last = result[result.length - 1];
                        inQuote = false;
                        result[result.length - 1] = last.substring(1, last.length - 1);
                    }
                }
            }
            return result;
        }

        var splits = lex(cmd);
        var cmdName = splits[0];

        var command: Command<S> | null = null;
        for(var i=0; i<this.registry.length; i++) {
            var c = this.registry[i];
            if(c.name == cmdName) {
                command = c;
                break;
            }

            for(var j=0; j<c.aliases.length; j++) {
                var a = c.aliases[j];
                if(a == cmdName) {
                    command = c;
                    break;
                }
            }
            if(command != null) break;
        }
        if(command == null) throw new Error("Command not found");

        var context = new CommandContext(source, cmd);
        splits.shift();
        var node: CommandNode<S, any> = command.rootNode;
        for(var i=0; i<splits.length; i++) {
            var split = splits[i];

            var hasNext = false;
            var literal = node.findLiteralChild(split);
            if(literal != null) {
                node = literal;
            } else {
                // Try argument nodes.
                var arg = node.findFirstArgumentChild();
                if(arg != null) {
                    node = arg;
                    context.args[arg.name] = split;
                }
            }

            // If no node for this split, throw an error.
            if(node == null) {
                throw new Error("Command not found");
            }
        }

        return new ParseResults(cmd, node, context);
    }
}

export class CommandResult {
    public error: Error | null;

    public constructor(error: Error | null = null) {
        this.error = error;
    }

    public isSuccessed(): boolean {
        return this.error != null;
    }

    public static success(): CommandResult {
        return new CommandResult();
    }

    public static error(error: Error): CommandResult {
        return new CommandResult(error);
    }
}

export class CommandContext<S> {
    public rawCommand: string;
    public args: any = {}
    public source: S;

    public constructor(source: S, rawCommand: string) {
        this.source = source;
        this.rawCommand = rawCommand;
    }
}