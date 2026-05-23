import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { forwardRef, useImperativeHandle, useCallback, memo, useEffect, useRef } from "react";

export interface RichComposerHandle {
  clear: () => void;
  focus: () => void;
  insertText: (text: string) => void;
}

interface RichComposerProps {
  content: string;
  onContentChange: (content: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onEnter?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const RichComposer = memo(
  forwardRef<RichComposerHandle, RichComposerProps>(
    function RichComposer(
      {
        content,
        onContentChange,
        onKeyDown,
        onEnter,
        placeholder = "输入下一步要求...",
        disabled = false,
        className,
      },
      ref,
    ) {
      const isInternalChange = useRef(false);

      const editor = useEditor({
        extensions: [
          StarterKit.configure({
            heading: false,
            bulletList: false,
            orderedList: false,
            blockquote: false,
            horizontalRule: false,
          }),
          Mention.configure({
            HTMLAttributes: { class: "rich-mention" },
            suggestion: {
              char: "@",
              items: () => [],
              command: () => false,
            },
          }),
          Placeholder.configure({ placeholder }),
        ],
        content,
        editable: !disabled,
        editorProps: {
          attributes: {
            class: [
              "rich-composer-editor",
              className,
            ]
              .filter(Boolean)
              .join(" "),
          },
          handleKeyDown: (_, event) => {
            if (onKeyDown) onKeyDown(event as unknown as KeyboardEvent);
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (onEnter) onEnter();
              return true;
            }
            return false;
          },
        },
        onUpdate: ({ editor }) => {
          isInternalChange.current = true;
          onContentChange(editor.getText());
        },
      });

      // Sync external content changes into the editor
      useEffect(() => {
        if (!editor) return;
        if (isInternalChange.current) {
          isInternalChange.current = false;
          return;
        }
        const editorText = editor.getText();
        if (content !== editorText) {
          editor.commands.setContent(content);
        }
      }, [content, editor]);

      useImperativeHandle(ref, () => ({
        clear: () => {
          editor?.commands.clearContent();
        },
        focus: () => {
          editor?.commands.focus();
        },
        insertText: (text: string) => {
          editor?.commands.insertContent(text);
        },
      }), [editor]);

      return <EditorContent editor={editor} className="focus:outline-none" />;
    },
  ),
);

export default RichComposer;
