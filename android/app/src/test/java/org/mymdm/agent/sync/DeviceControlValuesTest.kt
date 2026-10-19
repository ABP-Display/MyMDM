package org.mymdm.agent.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceControlValuesTest {
    @Test
    fun volumePercentageIsConvertedAndClamped() {
        assertEquals(0, DeviceControlValues.volumeIndex(-5, 15))
        assertEquals(8, DeviceControlValues.volumeIndex(50, 15))
        assertEquals(15, DeviceControlValues.volumeIndex(120, 15))
    }

    @Test
    fun brightnessNeverTurnsThePanelFullyBlack() {
        assertEquals(1, DeviceControlValues.brightness(0))
        assertEquals(128, DeviceControlValues.brightness(50))
        assertEquals(255, DeviceControlValues.brightness(100))
    }
}
