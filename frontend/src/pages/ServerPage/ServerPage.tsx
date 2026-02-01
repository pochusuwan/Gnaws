import ServerTable from "../../components/ServerTable/ServerTable";
import type { Server } from "../../types";
import "./ServerPage.css";

type Props = {
    servers: Server[];
    loading: boolean;
};

export default function ServerPage(props: Props) {
    if (props.loading) {
        return <div>Loading servers...</div>;
    }

    return (
        <div className="serverPage">
            <ServerTable servers={props.servers} />
        </div>
    );
}
