import './AdminPanelButton.css'

type ButtonProps = {
    label: string;
    description: string;
    disabled: boolean;
    onClick?: () => void;
};
export default function AdminPanelButton(props: ButtonProps) {
    return (
        <>
            <button className="adminPanelButton" disabled={props.disabled || props.onClick === undefined} onClick={props.onClick}>
                {props.label}
            </button>
            <div>{props.description}</div>
        </>
    );
}
