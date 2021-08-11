type Consumer<T> = (obj: T) => void
type Nullable<T> = T | null

class Version<T> {
    public version: number
    private upgrader: Consumer<T>

    public constructor(version: number, upgrader: Consumer<T>) {
        this.version = version;
        this.upgrader = upgrader;
    }

    public upgrade(data: T) {
        this.upgrader(data)
    }
}

export class DataUpgrader<T> {
    private versions: Version<T>[]

    public constructor() {
        this.versions = [];
    }

    public getVersion(num: number): Nullable<Version<T>> {
        var v: Nullable<Version<T>> = null
        this.versions.forEach(n => {
            if(n && n.version == num) v = n;
        });
        return v;
    }

    public addVersion(num: number, upgrade: Consumer<T>) {
        this.versions.push(new Version<T>(num, upgrade));
    }

    public getNewestVersion(): Version<T> {
        var n = 0;
        var v: Nullable<Version<T>> = null;
        this.versions.forEach(ver => {
            var o = n;
            n = Math.max(n, ver.version);
            if(o != n) v = ver;
        });

        if(v == null) {
            throw new Error("There are no versions present.");
        }
        return v;
    }

    public getNextVersion(n: Version<T>): Nullable<Version<T>> {
        var v: Nullable<Version<T>> = null;
        this.versions.forEach(ver => {
            if(ver.version > n.version && v == null) {
                v = ver;
            }
        });
        return v;
    }

    public upgrade(data: T, sourceVersion: Version<T>, targetVersion: Version<T>) {
        targetVersion = targetVersion || this.getNewestVersion();
        var newVersion = this.getNextVersion(sourceVersion);
        if(newVersion == null) return;

        do {
            this.performUpgrade(data, newVersion);
            newVersion = this.getNextVersion(newVersion);
        } while(newVersion && newVersion.version < targetVersion.version)
    }

    public performUpgrade(data: T, version: Version<T>) {
        version.upgrade(data);
    }
}