import React, {useCallback, useState} from 'react';
import {createPortal} from 'react-dom';

import AiCrewConsole from './ai_crew_console';
import styles from './ai_crew_styles';

// A separate style tree prevents Mattermost theme selectors entering Multica.
export default function AiCrewPage() {
    const [root, setRoot] = useState<ShadowRoot | null>(null);
    const attach = useCallback((host: HTMLDivElement | null) => {
        if (host) {
            setRoot(host.shadowRoot ?? host.attachShadow({mode: 'open'}));
        }
    }, []);

    return (
        <div
            ref={attach}
            data-testid='multica-page'
            style={{position: 'fixed', inset: 0, zIndex: 1, display: 'block', isolation: 'isolate'}}
        >
            {root && createPortal(
                <>
                    <style>{styles}</style>
                    <AiCrewConsole/>
                </>,
                root,
            )}
        </div>
    );
}
