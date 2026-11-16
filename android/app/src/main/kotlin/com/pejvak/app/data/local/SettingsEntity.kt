package com.pejvak.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Key/value settings row, mirroring the RN `settings` table (key PK, value TEXT).
 * The full 12-table schema lands in Phase 2; this table anchors the Room pipeline.
 */
@Entity(tableName = "settings")
data class SettingsEntity(
    @PrimaryKey val key: String,
    val value: String,
)