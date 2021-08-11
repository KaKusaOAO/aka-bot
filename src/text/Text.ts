import { stringify } from "querystring";
import * as util from "util";

type Nullable<T> = T | null

interface Colorable<S> {
    alterColorCode(char: string): S
}

export class TextColor {
    public static readonly black = new TextColor("0", 30);
    public static readonly gold = new TextColor("6", 33);
    public static readonly gray = new TextColor("7", 37);
    public static readonly darkGray = new TextColor("8", 30, true);
    public static readonly green = new TextColor("a", 32, true);
    public static readonly aqua = new TextColor("b", 34, true);
    public static readonly red = new TextColor("c", 31, true);
    public static readonly yellow = new TextColor("e", 33, true);
    public static readonly white = new TextColor("f", 37, true);

    public static readonly COLOR_CHAR = "\u00a7";

    public code: string
    public color: number
    public isBright: boolean

    public constructor(code: string, color: number, isBright: boolean = false) {
        this.code = code;
        this.color = color;
        this.isBright = isBright;
    }

    public toAsciiCode(): string {
        return "\u001b[" + this.color + "m" + (this.isBright ? "\u001b[1m" : "");
    }

    public toMcCode(): string {
        return "\u00a7" + this.code.toLowerCase();
    }

    public static mcCodes(): string[] {
        return "0123456789abcdef".split("");
    }
}

export abstract class Text<S extends Text<S>> {
    private parent: Nullable<Text<any>> = null
    public color: Nullable<TextColor> = null
    public extra: Text<any>[] = []
    protected abstract resolveThis(): S

    public addExtra(text: Text<any>): S {
        this.extra.push(text);
        text.parent = this;
        return this.resolveThis();
    }

    public getParentColor(): TextColor {
        var parent = this.parent;
        if(parent == null) return TextColor.gray;
        return parent.color ?? parent.getParentColor();
    }

    public toAscii(): string {
        var extra = "";
        this.extra.forEach(text => {
            extra += text.toAscii() + (this.color ?? this.getParentColor()).toAsciiCode();
        });
        return extra;
    }

    public toPlainText(): string {
        var extra = "";
        this.extra.forEach(text => {
            extra += text.toPlainText();
        });
        return extra;
    }

    public setColor(color: Nullable<TextColor>): S {
        this.color = color;
        return this.resolveThis();
    }
}

export class LiteralText extends Text<LiteralText> implements Colorable<LiteralText> {
    public text: string

    public constructor(text: string) {
        super();
        this.text = text;
    }

    protected resolveThis(): LiteralText {
        return this;
    }

    public alterColorCode(char: string): LiteralText {
        var modifiers: { index: number, char: string }[] = [];

        for(var i = 0; i < this.text.length; i++) {
            var b = this.text;
            if(b[i] == char && TextColor.mcCodes().indexOf(b[i + 1]) > -1) {
                modifiers.push({
                    index: i, 
                    char: TextColor.COLOR_CHAR
                });
                modifiers.push({
                    index: i + 1, 
                    char: b[i + 1].toLowerCase()
                });
            }
        }

        modifiers.forEach(m => {
            this.text = this.text.substring(0, m.index) + m.char + this.text.substring(m.index + 1);
        });
        return this;
    }

    public static of(text: string): LiteralText {
        return new LiteralText(text);
    }

    public toAscii(): string {
        var extra = super.toAscii();
        var color = (this.color ?? this.getParentColor()).toAsciiCode();
        return color + this.text + extra;
    }
    
    public toPlainText(): string {
        var extra = super.toPlainText();

        var result = "";
        for(var i = 0; i < this.text.length; i++) {
            var b = this.text;
            if(b[i] == TextColor.COLOR_CHAR && TextColor.mcCodes().indexOf(b[i + 1]) > -1) {
                i += 2;
            } else {
                result += b[i];
            }
        }

        return result + extra;
    }
}

export class FormatText extends Text<FormatText> implements Colorable<FormatText> {
    public format: string
    public with: Text<any>[] = []

    public constructor(format: string) {
        super();
        this.format = format;
    }

    public addWith(text: Text<any>): FormatText {
        this.with.push(text);
        return this;
    }

    protected resolveThis(): FormatText {
        return this;
    }

    public alterColorCode(char: string): FormatText {
        var modifiers: { index: number, char: string }[] = [];

        for(var i = 0; i < this.format.length; i++) {
            var b = this.format;
            if(b[i] == char && TextColor.mcCodes().indexOf(b[i + 1]) > -1) {
                modifiers.push({
                    index: i, 
                    char: "\u00a7"
                });
                modifiers.push({
                    index: i + 1, 
                    char: b[i + 1].toLowerCase()
                });
            }
        }

        modifiers.forEach(m => {
            this.format = this.format.substring(0, m.index) + m.char + this.format.substring(m.index + 1);
        });
        return this;
    }

    public static of(text: string): FormatText {
        return new FormatText(text);
    }

    public toAscii(): string {
        var extra = super.toAscii();
        var color = (this.color ?? this.getParentColor()).toAsciiCode();
        var withAscii = this.with.map(text => {
            return text.toAscii() + color;
        });
        return color + util.format.bind(null, this.format).apply(null, withAscii) + extra;
    }
    
    public toPlainText(): string {
        var extra = super.toPlainText();

        var result = "";
        for(var i = 0; i < this.format.length; i++) {
            var b = this.format;
            if(b[i] == TextColor.COLOR_CHAR && TextColor.mcCodes().indexOf(b[i + 1]) > -1) {
                i += 2;
            } else {
                result += b[i];
            }
        }

        var withAscii = this.with.map(text => {
            return text.toPlainText()
        });

        return util.format.bind(null, result).apply(null, withAscii) + extra;
    }
}