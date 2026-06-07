import { useToastStore } from '../toast.store';

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('starts with no toasts', () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('addToast appends a toast with a generated id and default "info" variant', () => {
    useToastStore.getState().addToast('Saved');
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ message: 'Saved', variant: 'info' });
    expect(typeof toasts[0].id).toBe('string');
    expect(toasts[0].id.length).toBeGreaterThan(0);
  });

  it('addToast honors an explicit variant', () => {
    useToastStore.getState().addToast('Boom', 'error');
    expect(useToastStore.getState().toasts[0].variant).toBe('error');
  });

  it('addToast keeps insertion order across multiple toasts', () => {
    const { addToast } = useToastStore.getState();
    addToast('first');
    addToast('second');
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['first', 'second']);
  });

  it('removeToast removes only the matching id', () => {
    const { addToast } = useToastStore.getState();
    addToast('keep');
    addToast('drop');
    const dropId = useToastStore.getState().toasts[1].id;
    useToastStore.getState().removeToast(dropId);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('keep');
  });

  it('removeToast is a no-op for an unknown id', () => {
    useToastStore.getState().addToast('only');
    useToastStore.getState().removeToast('does-not-exist');
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
