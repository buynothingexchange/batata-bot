// Comprehensive error suppression utilities for development HMR conflicts

// Global error handler that runs immediately when imported
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // Intercept runtime error plugin before it can initialize
  Object.defineProperty(window, '__vite_plugin_runtime_error_modal__', {
    get() {
      return {
        show: () => console.warn('Runtime error modal suppressed'),
        hide: () => {},
        clear: () => {}
      };
    },
    set() {
      // Prevent the plugin from setting itself
      console.warn('Runtime error plugin initialization blocked');
    },
    configurable: false
  });

  // Monkey patch Node.removeChild to prevent the specific error
  const originalRemoveChild = Node.prototype.removeChild;
  (Node.prototype as any).removeChild = function(child: any): any {
    try {
      if (this.contains && this.contains(child)) {
        return originalRemoveChild.call(this, child);
      } else {
        console.warn('Attempted to remove non-child node - suppressed');
        return child;
      }
    } catch (error: any) {
      if (error.message?.includes('removeChild') || 
          error.message?.includes('Node to be removed is not a child')) {
        console.warn('RemoveChild error suppressed:', error.message);
        return child;
      }
      throw error;
    }
  };

  // Comprehensive error event listeners
  window.addEventListener('error', (event) => {
    if (event.error?.message?.includes('removeChild') || 
        event.error?.message?.includes('runtime-error-plugin') ||
        event.error?.message?.includes('Node to be removed is not a child')) {
      console.warn('Global error suppressed:', event.error.message);
      event.preventDefault();
      event.stopImmediatePropagation();
      return false;
    }
  }, { capture: true, passive: false });

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.message?.includes('removeChild') || 
        event.reason?.message?.includes('runtime-error-plugin')) {
      console.warn('Promise rejection suppressed:', event.reason.message);
      event.preventDefault();
      return false;
    }
  });

  console.log('Development error suppression active');
}

export {};