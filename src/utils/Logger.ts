import { Text, LiteralText, FormatText, TextColor } from "../text/Text";
import { EOL } from "os";
import * as fs from "fs";

export class Logger {
    private fileName: string

    public constructor() {
        var fileName = "log/latest.log";
        if(!fs.existsSync("log/")) {
            fs.mkdirSync("log");
        }

        if(fs.existsSync(fileName)) {
            fs.renameSync(fileName, "log/" + new Date().toISOString().replace(/:/g, "-") + ".log");
        }
        fs.writeFileSync(fileName, "");
        this.fileName = fileName;
    }

    private writeConsole(message: Text<any> | string, level: Text<any>) {
        var text = (typeof message == "string") ? LiteralText.of(message) : message;
        var format = FormatText.of("| [%s] ")
            .addWith(level)
            // .addWith(LiteralText.of("Kazuna").setColor(TextColor.gold))
            .addExtra(text);
        process.stdout.write(format.toAscii() + EOL);
    }

    private writeLog(message: Text<any> | string, level: Text<any>) {
        var text = (typeof message == "string") ? LiteralText.of(message) : message;
        var format = FormatText.of("[%s] [%s] ")
            .addWith(level)
            .addWith(LiteralText.of(new Date().toISOString()))
            .addExtra(text);
        fs.appendFileSync(this.fileName, format.toPlainText() + "\n");
    }

    public debug(message: Text<any> | string) {
        var level = LiteralText.of("DEBUG").setColor(TextColor.gray);
        this.writeConsole(message, level);
        this.writeLog(message, level);
    }

    public info(message: Text<any> | string) {
        var level = LiteralText.of("INFO").setColor(TextColor.aqua);
        this.writeConsole(message, level);
        this.writeLog(message, level);
    }

    public warn(message: Text<any> | string) {
        var level = LiteralText.of("WARN").setColor(TextColor.yellow);
        this.writeConsole(message, level);
        this.writeLog(message, level);
    }

    public error(message: Text<any> | string) {
        var level = LiteralText.of("ERROR").setColor(TextColor.red);
        this.writeConsole(message, level);
        this.writeLog(message, level);
    }

    public fatal(message: Text<any> | string) {
        var level = LiteralText.of("FATAL").setColor(TextColor.red);
        this.writeConsole(message, level);
        this.writeLog(message, level);
    }
}