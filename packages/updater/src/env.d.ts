declare namespace NodeJS {
  interface Process {
    /** Electron: absolute path to the app's Resources directory. */
    resourcesPath: string;
  }
}
