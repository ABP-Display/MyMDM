package org.mymdm.agent.sync

import kotlin.math.roundToInt

object DeviceControlValues {
    fun volumeIndex(percent: Int, maximum: Int): Int =
        (maximum.coerceAtLeast(0) * percent.coerceIn(0, 100) / 100f).roundToInt()

    fun brightness(percent: Int): Int =
        (255 * percent.coerceIn(0, 100) / 100f).roundToInt().coerceAtLeast(1)
}
