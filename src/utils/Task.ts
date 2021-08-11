export class Task {
    public static run(action: () => void) {
        action();
    }

    public static delay(millis: number): Promise<void> {
        return new Promise((resolve, _) => {
            setTimeout(() => {
                resolve();
            }, millis);
        });
    }
}