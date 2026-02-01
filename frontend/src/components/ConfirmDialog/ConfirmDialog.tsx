import { useCallback, useRef, useState } from "react";
import "./ConfirmDialog.css";

type ConfirmResult = boolean | null;

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
    onResult: (result: ConfirmResult) => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
    const message = props.message ?? "Are you sure?";
    const yesMessage = props.yesMessage ?? "Yes";
    const noMessage = props.noMessage ?? "No";
    return (
        <div className="confirmDialogRoot" onClick={() => props.onResult(null)}>
            <div onClick={(e) => e.stopPropagation()} className="confirmDialog">
                <p>{message}</p>
                <div className="confirmDialogButtons">
                    <button onClick={() => props.onResult(true)}>{yesMessage}</button>
                    <button onClick={() => props.onResult(false)}>{noMessage}</button>
                </div>
            </div>
        </div>
    );
}
