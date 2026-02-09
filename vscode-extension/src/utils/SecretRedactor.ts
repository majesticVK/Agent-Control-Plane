export class SecretRedactor {
    private static readonly PATTERNS = [
        /sk-[a-zA-Z0-9]{20,}/g, // OpenAI style
        /ghp_[a-zA-Z0-9]{20,}/g, // GitHub
        /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, // JWT
        /xox[baprs]-[a-zA-Z0-9]{10,}/g, // Slack
    ];

    public static redact(text: string): string {
        if (!text) return text;
        let redacted = text;
        for (const pattern of this.PATTERNS) {
            redacted = redacted.replace(pattern, '********');
        }
        return redacted;
    }

    public static redactObject(obj: any): any {
        if (typeof obj === 'string') {
            return this.redact(obj);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.redactObject(item));
        }
        if (obj && typeof obj === 'object') {
            const newObj: any = {};
            for (const key in obj) {
                // Heuristic for keys
                if (/key|token|secret|password|auth/i.test(key)) {
                    newObj[key] = '********';
                } else {
                    newObj[key] = this.redactObject(obj[key]);
                }
            }
            return newObj;
        }
        return obj;
    }
}
