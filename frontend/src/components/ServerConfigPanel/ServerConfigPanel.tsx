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
    disabled: boolean;
    setMessage: (message: string) => void;
};
export default function ServerConfigPanel(props: ServerConfigPanelProps) {
    const { server, callAction } = props;

    // Increase storage dialog
    const { open: increaseStorageOpen, onResult: increaseStorageResult, confirm: increaseStorageConfirm } = useConfirm();
    // Instance type dialog
    const { open: instanceTypeOpen, onResult: instanceTypeResult, confirm: instanceTypeConfirm } = useConfirm();
    // Custom subdomain dialog
    const { open: customSubdomainOpen, onResult: customSubdomainResult, confirm: customSubdomainConfirm } = useConfirm();

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

    const buildCustomSubdomainMessage = useCallback((input: string) => {
        const isValid = /^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$/.test(input);
        return (
            <div>
                <div>Enter a fully qualified subdomain you own in AWS Route 53.</div>
                <div>Example: <code>mc.example.com</code></div>
                <div>Must have exactly 3 parts separated by dots. Each part may only contain letters, numbers, and hyphens.</div>
                <div>If a record for this subdomain already exists, it will be replaced. If multiple servers use the same subdomain, the last one to start will claim it.</div>
                {input && !isValid && <div style={{ color: "#f44" }}>Invalid. Must be a fully qualified domain (e.g. mc.example.com)</div>}
            </div>
        );
    }, []);

    const callSetCustomSubdomain = useCallback(async () => {
        const result = await customSubdomainConfirm();
        const subdomain = result?.input?.trim();
        if (subdomain && result?.result) {
            callAction("set_custom_subdomain", true, { subdomain });
        }
    }, [callAction]);

    const callChangeInstanceType = useCallback(async () => {
        const result = await instanceTypeConfirm();
        const instanceType = result?.input;
        if (instanceType) {
            callAction("Change_Instance_Type", true, { instanceType });
        }
    }, [callAction]);

    return (
        <div>
            <div>Instance Type: {server.ec2?.instanceType}</div>
            <div>Custom Subdomain: {server.configuration?.customSubdomain ?? "-"}</div>
            <div className="serverConfigPanelButtonGrid">
                <AdminPanelButton
                    disabled={props.disabled}
                    label={`Scheduled Shutdown: ${server?.configuration?.scheduledShutdownDisabled ? "Disabled" : "Enabled"}`}
                    description="Schedule an automatic shutdown at a set time. When triggered, the server will save, exit, and backup before stopping the instance. Players can extend the shutdown time by 1 hour, up to a maximum of 10 hours."
                    onClick={() => callAction("toggle_scheduled_shutdown", true)}
                />
                <AdminPanelButton
                    disabled={props.disabled}
                    label="Increase Storage"
                    description="Storage has a continuous cost even when the server is offline. Once increased, storage size cannot be decreased. After increasing, you must wait at least 15 minutes and restart the instance to apply the changes."
                    onClick={callIncreaseStorage}
                />
                <AdminPanelButton
                    disabled={props.disabled}
                    label="Change Instance Type"
                    description="Instance types define your server's CPU, memory, and hourly cost. You can change the instance type at any time, but the instance must be offline. Only upgrade if you are consistently experiencing performance issues to avoid unnecessary costs."
                    onClick={callChangeInstanceType}
                />
                <AdminPanelButton
                    disabled={props.disabled}
                    label="Set Custom Subdomain"
                    description="The server's IP address changes every time it starts. If you have a domain hosted in AWS Route 53, you can assign a subdomain (e.g. mc.example.com) so players always connect using the same address."
                    onClick={callSetCustomSubdomain}
                />
                {customSubdomainOpen && (
                    <ConfirmDialog
                        message={buildCustomSubdomainMessage}
                        yesMessage="Confirm"
                        noMessage="Cancel"
                        onResult={customSubdomainResult}
                        inputValue={server.configuration?.customSubdomain ?? ""}
                    />
                )}
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
        </div>
    );
}
