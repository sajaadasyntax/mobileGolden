import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';

interface PieChartData {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartData[];
  size?: number;
  innerRadius?: number;
  showLabels?: boolean;
  theme: any;
  locale: string;
}

export default function PieChart({ 
  data, 
  size = 200, 
  innerRadius = 0,
  showLabels = true,
  theme,
  locale,
}: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  if (total === 0) {
    return (
      <View style={[styles.emptyContainer, { width: size, height: size }]}>
        <Text style={{ color: theme.textMuted }}>No data</Text>
      </View>
    );
  }

  const radius = size / 2;
  const center = size / 2;
  
  // Calculate pie slices
  let currentAngle = -90; // Start from top
  const slices = data.map((item, index) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    
    return {
      ...item,
      percentage,
      startAngle,
      endAngle,
      angle,
    };
  });

  // Convert angle to radians
  const toRadians = (angle: number) => (angle * Math.PI) / 180;

  // Create SVG arc path
  const createArcPath = (startAngle: number, endAngle: number, outerR: number, innerR: number) => {
    const startOuter = {
      x: center + outerR * Math.cos(toRadians(startAngle)),
      y: center + outerR * Math.sin(toRadians(startAngle)),
    };
    const endOuter = {
      x: center + outerR * Math.cos(toRadians(endAngle)),
      y: center + outerR * Math.sin(toRadians(endAngle)),
    };
    const startInner = {
      x: center + innerR * Math.cos(toRadians(endAngle)),
      y: center + innerR * Math.sin(toRadians(endAngle)),
    };
    const endInner = {
      x: center + innerR * Math.cos(toRadians(startAngle)),
      y: center + innerR * Math.sin(toRadians(startAngle)),
    };

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    if (innerR === 0) {
      // Full pie slice
      return `
        M ${center} ${center}
        L ${startOuter.x} ${startOuter.y}
        A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}
        Z
      `;
    } else {
      // Donut slice
      return `
        M ${startOuter.x} ${startOuter.y}
        A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}
        L ${startInner.x} ${startInner.y}
        A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}
        Z
      `;
    }
  };

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <G>
          {slices.map((slice, index) => {
            // Handle full circle case
            if (slice.angle >= 359.9) {
              return (
                <Circle
                  key={index}
                  cx={center}
                  cy={center}
                  r={radius - 2}
                  fill={slice.color}
                />
              );
            }
            
            return (
              <Path
                key={index}
                d={createArcPath(slice.startAngle, slice.endAngle, radius - 2, innerRadius)}
                fill={slice.color}
              />
            );
          })}
          {innerRadius > 0 && (
            <Circle
              cx={center}
              cy={center}
              r={innerRadius - 2}
              fill={theme.surface}
            />
          )}
        </G>
      </Svg>

      {showLabels && (
        <View style={styles.legend}>
          {data.slice(0, 8).map((item, index) => (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: item.color }]} />
              <Text style={[styles.legendLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.legendValue, { color: theme.text }]}>
                {((item.value / total) * 100).toFixed(1)}%
              </Text>
            </View>
          ))}
          {data.length > 8 && (
            <Text style={[styles.moreText, { color: theme.textMuted }]}>
              +{data.length - 8} {locale === 'ar' ? 'المزيد' : 'more'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  legend: {
    marginTop: 16,
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 8,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
  },
  legendValue: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
  },
  moreText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});

