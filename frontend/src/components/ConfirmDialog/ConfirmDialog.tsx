import { useCallback, useRef, useState } from "react";
import "./ConfirmDialog.css";

type ConfirmResult = { input?: string; result: boolean } | null;

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
    message?: React.ReactNode | ((inputValue: string) => React.ReactNode);
    yesMessage?: string;
    noMessage?: string;
    inputValue?: string;
    onResult: (result: ConfirmResult) => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
    const [inputValue, setInputValue] = useState(props.inputValue ?? "");
    let message: string | React.ReactNode = "Are you sure?";
    if (typeof props.message === "function") {
        message = props.message(inputValue);
    } else if (props.message) {
        message = props.message;
    }
    const yesMessage = props.yesMessage ?? "Yes";
    const noMessage = props.noMessage ?? "No";
    return (
        <div className="confirmDialogRoot" onMouseDown={() => props.onResult(null)}>
            <div onMouseDown={(e) => e.stopPropagation()} className="confirmDialog">
                <p style={{ whiteSpace: "pre-line" }}>{message}</p>
                {props.inputValue !== undefined && <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />}
                <div className="confirmDialogButtons">
                    <button onClick={() => props.onResult({ input: inputValue, result: true })}>{yesMessage}</button>
                    <button onClick={() => props.onResult({ input: inputValue, result: false })}>{noMessage}</button>
                </div>
            </div>
        </div>
    );
}
