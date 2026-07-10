declare global {
  interface Window {
    process?: {
      env: {
        NODE_ENV: string;
      };
    };
  }
}

const processShim = {
  env: {
    NODE_ENV: window.location.hostname === 'localhost' ? 'development' : 'production',
  },
};

if (!globalThis.process) {
  Object.defineProperty(globalThis, 'process', {
    value: processShim,
    configurable: true,
    writable: true,
  });
}

export {};
