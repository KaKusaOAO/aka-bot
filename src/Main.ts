import { Akabot } from "./Akabot";
import { Logger } from "./utils/Logger";

export class Main {
    public static main() {
        var bot: Akabot = new Akabot();
        process.setUncaughtExceptionCaptureCallback(err => {
            bot.logger.error(err.toString());
            bot.logger.error("Stack: " + (err.stack ?? ""));
        });
    }
}