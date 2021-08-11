declare module "node-fetch" {
    declare function fetch(url: string): Promise<Response>;
    export default fetch;
}

interface String {
    matchAll(regexp: RegExp): RegExpStringIterator
}

type RegExpString = {
    done: boolean,
    value: {
        input: string,
        index: number,
        groups?: any,
        [index: number]: string
    }
}

declare interface RegExpStringIterator {
    next(): RegExpString
}

declare module "node-cron" {
    declare interface CronTask {
        public stop();
    }

    export function schedule(cron: string, callback: () => void): CronTask;
}