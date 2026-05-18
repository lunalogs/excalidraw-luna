import {
  LoadIcon,
  loginIcon,
  ExcalLogo,
  eyeIcon,
  save,
} from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";

import { saveDebugState } from "./DebugCanvas";

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenFromGoogleDrive: () => void;
  onSaveToGoogleDrive: () => void;
  onSaveAsGoogleDrive: () => void;
  canSaveToGoogleDrive: boolean;
}> = React.memo((props) => {
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.Item icon={LoadIcon} onSelect={props.onOpenFromGoogleDrive}>
        Open from Google Drive
      </MainMenu.Item>
      <MainMenu.DefaultItems.SaveToActiveFile />
      {props.canSaveToGoogleDrive && (
        <MainMenu.Item icon={save} onSelect={props.onSaveToGoogleDrive}>
          Save to Google Drive
        </MainMenu.Item>
      )}
      <MainMenu.Item icon={save} onSelect={props.onSaveAsGoogleDrive}>
        Save copy to Google Drive
      </MainMenu.Item>
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.ItemLink
        icon={ExcalLogo}
        href={`${
          import.meta.env.VITE_APP_PLUS_LP
        }/plus?utm_source=excalidraw&utm_medium=app&utm_content=hamburger`}
        className=""
      >
        Excalidraw+
      </MainMenu.ItemLink>
      <MainMenu.DefaultItems.Socials />
      <MainMenu.Item
        icon={loginIcon}
        onSelect={
          props.isAuthenticated ? props.onSignOut : props.onSignIn
        }
        className="highlighted"
      >
        {props.isAuthenticated
          ? `Sign out${props.userEmail ? ` (${props.userEmail})` : ""}`
          : "Sign in with Google"}
      </MainMenu.Item>
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
