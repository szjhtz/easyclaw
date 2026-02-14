declare const __BUILD_TIMESTAMP__: string;

declare namespace NodeJS {
  interface Process {
    resourcesPath: string;
  }
}
