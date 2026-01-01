/**
 * Inserts text into the currently active input or textarea.
 * Returns true if successful, false if no compatible element was focused.
 */
export function insertTextIntoActiveElement(text: string): boolean {
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    
    // Check if the element is an input or textarea
    if (activeElement && (['INPUT', 'TEXTAREA'].includes(activeElement.tagName.toUpperCase()))) {
        const start = activeElement.selectionStart || 0;
        const end = activeElement.selectionEnd || 0;
        const currentText = activeElement.value;

        // Check if we need a leading space
        // Add space if:
        // 1. Not at the start of the field
        // 2. The character before cursor is not already a whitespace
        let prefix = "";
        if (start > 0 && !/\s/.test(currentText[start - 1])) {
            prefix = " ";
        }

        const finalCode = prefix + text;

        // Insert code at cursor position
        activeElement.value = currentText.substring(0, start) + finalCode + currentText.substring(end);

        // Dispatch input event for frameworks (React/Angular/Vue)
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        
        return true;
    }
    
    return false;
}
