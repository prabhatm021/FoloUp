"use client";

import { ClientService } from "@/services/clients.service";
import { LOCAL_ORG_ID, LOCAL_ORG_NAME, LOCAL_USER_EMAIL, LOCAL_USER_ID } from "@/lib/local-user";
import type { User } from "@/types/user";
import React, { useState, useContext, type ReactNode, useEffect } from "react";

interface ClientContextProps {
  client?: User;
}

export const ClientContext = React.createContext<ClientContextProps>({
  client: undefined,
});

interface ClientProviderProps {
  children: ReactNode;
}

export function ClientProvider({ children }: ClientProviderProps) {
  const [client, setClient] = useState<User>();

  useEffect(() => {
    const seedLocalUser = async () => {
      try {
        const response = await ClientService.getClientById(
          LOCAL_USER_ID,
          LOCAL_USER_EMAIL,
          LOCAL_ORG_ID,
        );
        setClient(response);
        await ClientService.getOrganizationById(LOCAL_ORG_ID, LOCAL_ORG_NAME);
      } catch (error) {
        console.error(error);
      }
    };

    seedLocalUser();
  }, []);

  return (
    <ClientContext.Provider value={{ client }}>
      {children}
    </ClientContext.Provider>
  );
}

export const useClient = () => {
  const value = useContext(ClientContext);
  return value;
};
