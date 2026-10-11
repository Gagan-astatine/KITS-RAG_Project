import { useEffect, useState } from "react";
import "./Sidebar.css";

function dateGroup(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const chatDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.floor((today - chatDate) / 86400000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo <= 7) return "Previous 7 days";
  return "Older";
}

function sortedNewestFirst(chats) {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onClearAll,
  mobileOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
  user,
}) {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 899px)").matches,
  );
  const groups = ["Today", "Yesterday", "Previous 7 days", "Older"];
  const groupedChats = new Map(groups.map((group) => [group, []]));
  sortedNewestFirst(chats).forEach((chat) => {
    groupedChats.get(dateGroup(chat.updatedAt)).push(chat);
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const updateMobile = () => setIsMobile(media.matches);
    media.addEventListener("change", updateMobile);
    return () => media.removeEventListener("change", updateMobile);
  }, []);

  function confirmDelete(chat) {
    if (window.confirm(`Delete "${chat.title}"? This cannot be undone.`)) {
      onDeleteChat(chat.id);
    }
  }

  function confirmClearAll() {
    if (window.confirm("Clear all chat history? This cannot be undone.")) {
      onClearAll();
    }
  }

  return (
    <>
      <button
        className={`sidebar-backdrop${mobileOpen ? " is-open" : ""}`}
        type="button"
        aria-label="Close chat history"
        onClick={onClose}
        tabIndex={mobileOpen ? 0 : -1}
      />
      <aside
        className={`history-sidebar${mobileOpen ? " is-open" : ""}${collapsed ? " is-collapsed" : ""}`}
        aria-label="Chat history"
        aria-hidden={isMobile && !mobileOpen}
      >
        <div className="sidebar-topbar">
          <button
            className="sidebar-toggle-button"
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
          >
            <span aria-hidden="true">{collapsed ? "☰" : "‹"}</span>
          </button>
          <button className="new-chat-button" type="button" onClick={onNewChat}>
            <span aria-hidden="true">＋</span>
            {!collapsed && <span>New chat</span>}
          </button>
        </div>
        <nav className="chat-history-list" aria-label="Past chats">
          {groups.map((group) => {
            const groupChats = groupedChats.get(group);
            if (!groupChats.length) return null;
            return (
              <section className="chat-history-group" key={group}>
                <h2>
                  <span>{group}</span>
                </h2>
                <ul>
                  {groupChats.map((chat) => (
                    <li
                      className={`chat-history-item${chat.id === activeChatId ? " is-active" : ""}`}
                      key={chat.id}
                    >
                      <button
                        className="chat-history-select"
                        type="button"
                        aria-current={chat.id === activeChatId ? "page" : undefined}
                        title={chat.title}
                        onClick={() => {
                          onSelectChat(chat.id);
                          onClose();
                        }}
                      >
                        {collapsed && (
                          <span className="collapsed-chat-icon" aria-hidden="true">
                            ▢
                          </span>
                        )}
                        {!collapsed && (
                          <span className="chat-history-title notranslate" translate="no">
                            {chat.title}
                          </span>
                        )}
                      </button>
                      {!collapsed && (
                        <button
                          className="delete-chat-button"
                          type="button"
                          aria-label={`Delete chat: ${chat.title}`}
                          title="Delete chat"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(chat);
                          }}
                        >
                          <span aria-hidden="true">🗑</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>
        {!collapsed && (
          <button
            className="clear-chats-button"
            type="button"
            disabled={chats.length === 0}
            onClick={confirmClearAll}
          >
            <span>Clear all chats</span>
          </button>
        )}
      </aside>
    </>
  );
}
