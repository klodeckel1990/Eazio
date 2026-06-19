package de.tellerwert.app

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Volume
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Android-Pendant zu HealthSync.swift: liest Schritte, Aktivitätskalorien und
 * Gewicht aus Health Connect und schreibt die Ernährungs-Tagessummen zurück.
 * Spricht denselben JS-Vertrag (lib/health.ts) wie iOS — die Plattform-Weiche
 * sitzt im JS. Bewusst als Capacitor-Plugin (korrektes Injection-Timing auf
 * Android), Ergebnis wird im JS in dasselbe 'eazio:health'-Event übersetzt.
 */
@CapacitorPlugin(name = "Health")
class HealthPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val readPerms = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
    )
    private val writePerms = setOf(
        HealthPermission.getWritePermission(NutritionRecord::class),
        HealthPermission.getWritePermission(HydrationRecord::class),
    )

    /** Client nur, wenn Health Connect auf dem Gerät verfügbar ist (ab Android 14
     *  im OS, davor separate App). Sonst null → JS bekommt error:"unavailable". */
    private fun clientOrNull(): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
            HealthConnectClient.getOrCreate(context)
        else null

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", clientOrNull() != null))
    }

    @PluginMethod
    fun sync(call: PluginCall) {
        val client = clientOrNull() ?: run {
            call.resolve(JSObject().put("error", "unavailable"))
            return
        }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.containsAll(readPerms)) {
                    // erste Nutzung → Health-Connect-Berechtigungsdialog
                    val intent = PermissionController.createRequestPermissionResultContract()
                        .createIntent(context, readPerms + writePerms)
                    startActivityForResult(call, intent, "permsResult")
                } else {
                    readInto(client, call)
                }
            } catch (e: Exception) {
                call.resolve(JSObject().put("error", "read_failed"))
            }
        }
    }

    @ActivityCallback
    private fun permsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val client = clientOrNull() ?: run {
            call.resolve(JSObject().put("error", "unavailable"))
            return
        }
        scope.launch {
            val granted = client.permissionController.getGrantedPermissions()
            if (granted.containsAll(readPerms)) readInto(client, call)
            else call.resolve(JSObject().put("error", "denied"))
        }
    }

    private suspend fun readInto(client: HealthConnectClient, call: PluginCall) {
        try {
            val zone = ZoneId.systemDefault()
            val start = LocalDate.now().atStartOfDay(zone).toInstant()
            val now = Instant.now()
            val agg = client.aggregate(
                AggregateRequest(
                    metrics = setOf(
                        StepsRecord.COUNT_TOTAL,
                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    ),
                    timeRangeFilter = TimeRangeFilter.between(start, now),
                ),
            )
            val out = JSObject()
            agg[StepsRecord.COUNT_TOTAL]?.let { out.put("steps", it) }
            agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { out.put("activeKcal", it.inKilocalories) }

            // neuester Gewichts-Sample (z. B. von einer smarten Waage)
            val weights = client.readRecords(
                ReadRecordsRequest(
                    recordType = WeightRecord::class,
                    timeRangeFilter = TimeRangeFilter.before(now),
                    ascendingOrder = false,
                    pageSize = 1,
                ),
            )
            weights.records.firstOrNull()?.let {
                out.put("weightKg", it.weight.inKilograms)
                out.put("weightAt", it.time.toString())
            }
            call.resolve(out)
        } catch (e: Exception) {
            call.resolve(JSObject().put("error", "read_failed"))
        }
    }

    @PluginMethod
    fun writeDay(call: PluginCall) {
        val client = clientOrNull() ?: run { call.resolve(); return }
        val dateStr = call.getString("date") ?: run { call.resolve(); return }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.containsAll(writePerms)) {
                    call.resolve() // ohne Schreibrechte still überspringen
                    return@launch
                }
                val zone = ZoneId.systemDefault()
                val date = LocalDate.parse(dateStr)
                val startZdt = date.atStartOfDay(zone)
                val endZdt =
                    if (date == LocalDate.now()) ZonedDateTime.now(zone)
                    else date.plusDays(1).atStartOfDay(zone).minusSeconds(1)
                val start = startZdt.toInstant()
                val end = endZdt.toInstant()

                // Idempotenter Tagesabgleich: erst unsere eigenen Tageswerte
                // löschen (Health Connect lässt nur das Löschen selbst
                // geschriebener Records zu — fremde Daten bleiben unberührt).
                client.deleteRecords(NutritionRecord::class, TimeRangeFilter.between(start, end))
                client.deleteRecords(HydrationRecord::class, TimeRangeFilter.between(start, end))

                val records = mutableListOf<Record>()
                records.add(
                    NutritionRecord(
                        startTime = start, startZoneOffset = startZdt.offset,
                        endTime = end, endZoneOffset = endZdt.offset,
                        energy = Energy.kilocalories(call.getDouble("kcal") ?: 0.0),
                        protein = Mass.grams(call.getDouble("protein") ?: 0.0),
                        totalFat = Mass.grams(call.getDouble("fat") ?: 0.0),
                        totalCarbohydrate = Mass.grams(call.getDouble("carbs") ?: 0.0),
                        metadata = Metadata.manualEntry(),
                    ),
                )
                val water = call.getDouble("waterMl") ?: 0.0
                if (water > 0) {
                    records.add(
                        HydrationRecord(
                            startTime = start, startZoneOffset = startZdt.offset,
                            endTime = end, endZoneOffset = endZdt.offset,
                            volume = Volume.milliliters(water),
                            metadata = Metadata.manualEntry(),
                        ),
                    )
                }
                client.insertRecords(records)
                call.resolve()
            } catch (e: Exception) {
                call.resolve()
            }
        }
    }
}
