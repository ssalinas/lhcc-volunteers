import { useEffect } from 'react';

const MESSAGE = 'You have unsaved changes on this page. Leave without saving?';

/**
 * Warns before leaving a page with unsaved edits — both a full page unload (tab close,
 * refresh) and in-app navigation via a link click (nav bar, etc.). The app uses
 * <BrowserRouter>, not a data router, so react-router's useBlocker isn't available; catching
 * link clicks in the capture phase covers every in-app navigation an admin can actually make.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = MESSAGE;
    }

    function onClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!anchor || anchor.getAttribute('target') === '_blank') return;
      if (!confirm(MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
