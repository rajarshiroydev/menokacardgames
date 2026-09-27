export declare const ROOT: URL;
export declare const TESTBED_ENV_FILE: URL;
export declare function readEnvFile(url: URL): Record<string, string>;
export declare function localEnv(): Record<string, string>;
export declare function testbedEnv(): Record<string, string>;
