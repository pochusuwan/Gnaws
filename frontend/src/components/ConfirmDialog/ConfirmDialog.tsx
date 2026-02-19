import { useCallback, useRef, useState } from "react";
import "./ConfirmDialog.css";

type ConfirmResult = { input?: string, result: boolean } | null;

export function useConfirm() {
    const [open, setOpen] = useState(false);
    const resolver = useRef<(v: ConfirmResult) => void>(null);

    const confirm = useCallback((): Promise<ConfirmResult> => {
        setOpen(true);
        return new Promise((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const close = useCallback((result: ConfirmResult) => {
        setOpen(false);
        resolver.current?.(result);
        resolver.current = null;
    }, []);

    return {
        open,
        confirm,
        onResult: close,
    };
}

type ConfirmDialogProps = {
    message?: string;
    yesMessage?: string;
    noMessage?: string;
    inputValue?: boolean;
    onResult: (result: ConfirmResult) => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
    const [inputValue, setInputValue] = useState("");
    const message = props.message ?? "Are you sure?";
    const yesMessage = props.yesMessage ?? "Yes";
    const noMessage = props.noMessage ?? "No";
    return (
        <div className="confirmDialogRoot" onClick={() => props.onResult(null)}>
            <div onClick={(e) => e.stopPropagation()} className="confirmDialog">
                <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
                {props.inputValue && <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />}
                <div className="confirmDialogButtons">
                    <button onClick={() => props.onResult({ input: inputValue, result: true})}>{yesMessage}</button>
                    <button onClick={() => props.onResult({ input: inputValue, result: false})}>{noMessage}</button>
                </div>
            </div>
        </div>
    );
}
