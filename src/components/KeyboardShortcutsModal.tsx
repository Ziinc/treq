import { KEYBOARD_SHORTCUT_SECTIONS } from "../lib/keyboard-shortcuts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Kbd, KbdGroup } from "./ui/kbd";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onOpenChange,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-2xl w-full overflow-y-auto"
        data-testid="keyboard-shortcuts-modal"
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
            <section
              key={section.title}
              aria-labelledby={`shortcut-section-${section.title}`}
            >
              <h3
                id={`shortcut-section-${section.title}`}
                className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.shortcuts.map((shortcut) => (
                  <li
                    key={`${section.title}-${shortcut.action}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground">{shortcut.action}</span>
                    <KbdGroup className="shrink-0">
                      {shortcut.keys.map((key, index) => (
                        <span
                          key={`${key}-${index}`}
                          className="inline-flex items-center gap-1"
                        >
                          {index > 0 && (
                            <span className="text-muted-foreground text-xs">
                              +
                            </span>
                          )}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </KbdGroup>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
