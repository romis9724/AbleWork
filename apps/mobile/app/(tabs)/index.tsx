import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import * as Location from 'expo-location'
import { attendanceApi } from '@/lib/api-client'

export default function HomeScreen() {
  const [loading, setLoading] = useState<'in' | 'out' | null>(null)

  const handleClock = async (type: 'in' | 'out') => {
    setLoading(type)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('권한 필요', '출퇴근 기록을 위해 위치 권한이 필요합니다.')
        return
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      if (type === 'in') {
        await attendanceApi.clockIn(location.coords.latitude, location.coords.longitude)
        Alert.alert('출근 완료', '출근이 기록되었습니다.')
      } else {
        await attendanceApi.clockOut(location.coords.latitude, location.coords.longitude)
        Alert.alert('퇴근 완료', '퇴근이 기록되었습니다.')
      }
    } catch {
      Alert.alert('오류', '처리 중 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AbleWork</Text>
      <Text style={styles.date}>
        {new Date().toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        })}
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.clockInButton]}
          onPress={() => handleClock('in')}
          disabled={loading !== null}
        >
          {loading === 'in' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>출근</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.clockOutButton]}
          onPress={() => handleClock('out')}
          disabled={loading !== null}
        >
          {loading === 'out' ? (
            <ActivityIndicator color="#f36f20" />
          ) : (
            <Text style={[styles.buttonText, { color: '#f36f20' }]}>퇴근</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f36f20',
    marginBottom: 8,
  },
  date: {
    fontSize: 16,
    color: '#666',
    marginBottom: 48,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockInButton: {
    backgroundColor: '#f36f20',
  },
  clockOutButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f36f20',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
})
