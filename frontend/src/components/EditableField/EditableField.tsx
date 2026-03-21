import "./EditableField.css";

type EditableFieldProps = {
    label: string;
    value: string;
    editing: boolean;
    onValueChange: (value: string) => void;
};
export function EditableField({ label, value, editing, onValueChange }: EditableFieldProps) {
    return (
        <div className="editableField">
            <span className="editableFieldLabel">{label}</span>
            {editing ? (
                <input type="text" value={value} onChange={(e) => onValueChange(e.target.value)} />
            ) : (
                <span className="editableFieldValue">{value}</span>
            )}
        </div>
    );
}
