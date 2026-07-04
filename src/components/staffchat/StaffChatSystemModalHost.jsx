// StaffChatSystemModalHost (2026-07-04, bug-hunt R1 #3) — hoists the intake /
// assessment modal OUT of the 50-message chat window.
//
// Pre-fix the modal state lived INSIDE StaffChatSystemCard: the message list
// renders only the latest 50 messages, so while a staff member was reading the
// intake data, 50 new chat messages evicted the card from the window → the
// card unmounted → the OPEN modal vanished mid-read. The host lives in
// StaffChatWidget (stable across the whole chat session); the card snapshots
// {sessionId, customerId, name} at click time so the modal keeps working even
// after its card scrolls out of existence.
//
// Cards mounted WITHOUT the host (standalone RTL tests, future embeds) fall
// back to their own local state — same UX, minus eviction-survival.
import { createContext, useContext, useMemo, useState } from 'react';
import { StaffChatIntakeModal } from './StaffChatIntakeModal.jsx';
import { StaffChatEdModalLauncher } from './StaffChatEdModalLauncher.jsx';

const StaffChatSystemModalContext = createContext(null);

export function useStaffChatSystemModal() {
  return useContext(StaffChatSystemModalContext);
}

export function StaffChatSystemModalHost({ children }) {
  // one modal at a time: {type:'intake', sessionId, customerId, name} |
  //                      {type:'assessment', customerId} | null
  const [modal, setModal] = useState(null);
  const api = useMemo(() => ({ open: setModal }), []);
  return (
    <StaffChatSystemModalContext.Provider value={api}>
      {children}
      {modal?.type === 'intake' && (
        <StaffChatIntakeModal
          sessionId={modal.sessionId}
          customerId={modal.customerId}
          name={modal.name}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'assessment' && (
        <StaffChatEdModalLauncher customerId={modal.customerId} onClose={() => setModal(null)} />
      )}
    </StaffChatSystemModalContext.Provider>
  );
}

export default StaffChatSystemModalHost;
