import React from "react";
import { usePosStore } from "../../store/posStore";
import { JamanAiAssistantModal } from "@jamanvaar/ui";
import { PosAssistantAction } from "@jamanvaar/business";

/**
 * PosChatbot — JAMAN AI Integration for POS Terminal
 *
 * The floating button has been REMOVED.
 * AI is now triggered exclusively from the POS Header (✨ JAMAN AI button).
 * This component only renders the right-side drawer.
 */
export const PosChatbot: React.FC = () => {
  const {
    isChatbotOpen,
    setIsChatbotOpen,
    setActiveTab,
    setIsShiftModalOpen,
    setIsCashDrawerModalOpen,
    setIsPrintQueueOpen,
    currentUser,
    activeTab
  } = usePosStore();

  const handlePerformAction = (action: PosAssistantAction) => {
    if (action.actionType === "NAVIGATE_TAB" && action.targetTab) {
      setActiveTab(action.targetTab);
    } else if (action.actionType === "OPEN_MODAL") {
      if (action.modalName === "SHIFT") setIsShiftModalOpen(true);
      else if (action.modalName === "CASH_DRAWER") setIsCashDrawerModalOpen(true);
      else if (action.modalName === "PRINT_QUEUE") setIsPrintQueueOpen(true);
    }
  };

  const userRole =
    currentUser?.roleId === "role-manager"
      ? "MANAGER"
      : currentUser?.roleId === "role-owner" || currentUser?.roleId === "role-admin"
      ? "OWNER_ADMIN"
      : "CASHIER";

  return (
    <JamanAiAssistantModal
      isOpen={isChatbotOpen}
      onClose={() => setIsChatbotOpen(false)}
      app="POS"
      userRole={userRole}
      posContext={activeTab}
      onPerformAction={handlePerformAction}
    />
  );
};
