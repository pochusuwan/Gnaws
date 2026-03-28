import { useCallback } from "react";
import type { Server } from "../../types";
import "./ServerConfigPanel.css";
import { ConfirmDialog, useConfirm } from "../ConfirmDialog/ConfirmDialog";
import AdminPanelButton from "../AdminPanelButton/AdminPanelButton";
import InstanceTypeGuide from "../InstanceTypeGuide/InstanceTypeGuide";

const STORAGE_COST_PER_GIB_PER_MONTH = 0.08;

type ServerConfigPanelProps = {
    server: Server;
    callAction: (action: string, refreshAfterSuccess: boolean, params?: { [key: string]: string | number }) => void;
    inProgress: boolean;
    setMessage: (message: string) => void;
};
export default function ServerConfigPanel(props: ServerConfigPanelProps) {
    const { server, callAction } = props;

    // Increase storage dialog
    const { open: increaseStorageOpen, onResult: increaseStorageResult, confirm: increaseStorageConfirm } = useConfirm();
    // Instance type dialog
    const { open: instanceTypeOpen, onResult: instanceTypeResult, confirm: instanceTypeConfirm } = useConfirm();

    const callIncreaseStorage = useCallback(async () => {
        const result = await increaseStorageConfirm();
        if (result?.result) {
            const newSize = parseInt(result?.input ?? "");
            if (isNaN(newSize)) {
                props.setMessage("Invalid storage size.");
            } else {
                callAction("Increase_Storage", false, { storage: newSize });
            }
        }
    }, [server, callAction]);
    const buildStorageConfirmationMessage = useCallback((input: string) => {
        const num = parseInt(input);
        const message = isNaN(num) ? "Invalid storage size." : `Estimated cost: $${num * STORAGE_COST_PER_GIB_PER_MONTH}/month.`;
        return (
            <div>
                <div>
                    See pricing details{" "}
                    <a href="https://aws.amazon.com/ebs/pricing/" target="_blank" rel="noopener noreferrer">
                        here
                    </a>
                </div>
                <div>Enter new storage size in GiB.</div>
                <div>{message}</div>
            </div>
        );
    }, []);

    const callChangeInstanceType = useCallback(async () => {
        const result = await instanceTypeConfirm();
        if (result?.result) {
            console.debug(result?.result);
        }
    }, [server, callAction]);

    return (
        <div className="serverConfigPanelButtonGrid">
            <AdminPanelButton
                disabled={props.inProgress}
                label={`${server?.configuration?.scheduledShutdownDisabled ? "Enable" : "Disable"} Scheduled Shutdown`}
                description="Schedule an automatic shutdown at a set time. When triggered, the server will save, exit, and backup before stopping the instance. Players can extend the shutdown time by 1 hour, up to a maximum of 10 hours."
                onClick={() => callAction("toggle_scheduled_shutdown", true)}
            />
            <AdminPanelButton
                disabled={props.inProgress}
                label="Increase Storage"
                description="Storage has a continuous cost even when the server is offline. Once increased, storage size cannot be decreased. After increasing, you must wait at least 15 minutes and restart the instance to apply the changes."
                onClick={callIncreaseStorage}
            />
            <AdminPanelButton
                disabled={props.inProgress}
                label="Change Instance Type"
                description="Instance types define your server's CPU, memory, and hourly cost. You can change the instance type at any time, but the instance must be offline. Only upgrade if you are consistently experiencing performance issues to avoid unnecessary costs."
                onClick={callChangeInstanceType}
            />
            {increaseStorageOpen && (
                <ConfirmDialog
                    message={buildStorageConfirmationMessage}
                    yesMessage="Confirm"
                    noMessage="Cancel"
                    onResult={increaseStorageResult}
                    inputValue={""}
                />
            )}
            {instanceTypeOpen && (
                <ConfirmDialog
                    message={InstanceTypeGuide}
                    yesMessage="Confirm"
                    noMessage="Cancel"
                    onResult={instanceTypeResult}
                    inputValue={""}
                />
            )}
        </div>
    );
}
