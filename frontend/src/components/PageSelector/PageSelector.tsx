import "./PageSelector.css";

type PageSelectorProps = {
    pages: string[];
    current: string;
    onSelect: (page: string) => void;
};
export default function PageSelector({ pages, current, onSelect }: PageSelectorProps) {
    return (
        <div className="pageSelector">
            {pages.map((page) => (
                <button
                    key={page}
                    onClick={() => onSelect(page)}
                    className={current === page ? "pageSelectorActive" : "pageSelectorInactive"}
                >
                    {page}
                </button>
            ))}
        </div>
    );
}
