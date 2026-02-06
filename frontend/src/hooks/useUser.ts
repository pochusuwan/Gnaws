import { useContext, createContext } from "react";
import type { User } from "../types";

export const UserContext = createContext<User | null>(null);

export const useUser = () => {
    const context = useContext(UserContext);

    if (context === null) {
        throw new Error("User not found in context");
    }

    return context;
};
