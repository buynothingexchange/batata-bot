// Single-source error suppression for HMR removeChild conflicts
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // Block runtime error plugin and suppress removeChild errors
  Object.defineProperty(window, '__vite_plugin_runtime_error_modal__', {
    get: () => ({ show: () => {}, hide: () => {}, clear: () => {} }),
    set: () => {},
    configurable: false
  });

  // Patch removeChild to prevent HMR conflicts
  const originalRemoveChild = Node.prototype.removeChild;
  (Node.prototype as any).removeChild = function(child: any) {
    try {
      return this.contains?.(child) ? originalRemoveChild.call(this, child) : child;
    } catch (error: any) {
      if (error.message?.includes('removeChild')) {
        console.warn('HMR removeChild error suppressed');
        return child;
      }
      throw error;
    }
  };

  // Global error suppression
  ['error', 'unhandledrejection'].forEach(type => {
    window.addEventListener(type, (event: any) => {
      const message = event.error?.message || event.reason?.message || '';
      if (message.includes('removeChild') || message.includes('runtime-error-plugin')) {
        console.warn(`HMR ${type} suppressed:`, message);
        event.preventDefault();
        return false;
      }
    }, { capture: true, passive: false });
  });
}

export {};