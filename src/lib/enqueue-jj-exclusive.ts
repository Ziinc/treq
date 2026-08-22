/**
 * jj working-copy snapshot is process-global. Concurrent get_workspace_diff /
 * get_workspace_changed_files from Review + the Changes pill panic inside
 * jj-lib (`local_working_copy` tree assertion) and the Review pane stays empty.
 */
let tail: Promise<unknown> = Promise.resolve();

export function enqueueJjExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
