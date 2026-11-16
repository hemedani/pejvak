package com.pejvak.app.ui.components.row

/**
 * A row action preset (DESING.md §9.2). [priority] is lower = more important; the
 * primary action must never disappear. [menuOnly] marks a destructive action that
 * takes a deliberate second tap (delete) — it always lives in the overflow menu.
 */
data class RowAction(
    val id: String,
    val icon: String,
    val label: String,
    val priority: Int,
    val menuOnly: Boolean = false,
    val destructive: Boolean = false,
    val onClick: () -> Unit = {},
)

data class RowLayout(
    val inline: List<RowAction>,
    val overflow: List<RowAction>,
)

/**
 * Plans a row's action cluster: inline → overflow, priority-preserving. The contract
 * (pinned by RowLayoutTest): no action is ever dropped (inline + overflow == all),
 * the primary action stays inline, and menuOnly/destructive actions go to overflow.
 */
fun planRowLayout(actions: List<RowAction>, maxInline: Int): RowLayout {
    val sorted = actions.sortedBy { it.priority }
    val inline = ArrayList<RowAction>()
    val overflow = ArrayList<RowAction>()
    for (action in sorted) {
        if (action.menuOnly) {
            overflow.add(action)
        } else if (inline.size < maxInline) {
            inline.add(action)
        } else {
            overflow.add(action)
        }
    }
    // Guarantee the primary (highest-priority non-menu) action is inline even if
    // maxInline is 0 — a row never silently drops its primary control.
    val primary = sorted.firstOrNull { !it.menuOnly }
    if (primary != null && primary !in inline) {
        inline.add(0, primary)
        overflow.remove(primary)
    }
    return RowLayout(inline, overflow)
}

/** Common presets (screens compose these instead of rebuilding them). */
object RowActions {
    fun play(onClick: () -> Unit) = RowAction("play", "play", "Play", priority = 0, onClick = onClick)
    fun history(onClick: () -> Unit) = RowAction("history", "history", "History", priority = 2, onClick = onClick)
    fun add(onClick: () -> Unit) = RowAction("add", "addToPlaylist", "Add to playlist", priority = 3, onClick = onClick)
    fun download(onClick: () -> Unit) = RowAction("download", "download", "Download", priority = 4, onClick = onClick)
    fun ai(onClick: () -> Unit) = RowAction("ai", "ai", "AI tools", priority = 5, onClick = onClick)
    fun delete(onClick: () -> Unit) =
        RowAction("delete", "trash", "Delete", priority = 9, menuOnly = true, destructive = true, onClick = onClick)
}