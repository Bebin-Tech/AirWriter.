'use client';

import { PAGE_SIZES, type PageSizeKey, type Paper } from '@/lib/notebook';
import type { Settings, Trigger } from '@/hooks/useAirNotebook';
import { Button, Row, Section, Segmented, Select, Slider, Swatches, Toggle } from './ui';

export function ControlPanel({
  settings, setSettings, hasSideCamera, onCalibrateDesk,
}: {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  hasSideCamera: boolean;
  onCalibrateDesk: () => void;
}) {
  const heightMode = settings.trigger === 'height';
  return (
    <div className="card scroll-thin flex max-h-[calc(100vh-104px)] flex-col overflow-y-auto">
      <Section title="Pen trigger">
        <Segmented<Trigger>
          value={settings.trigger}
          onChange={(trigger) => setSettings({ trigger })}
          options={[
            { value: 'height', label: 'Height', title: 'Side-camera fingertip height', disabled: !hasSideCamera },
            { value: 'pinch', label: 'Pinch', title: 'Thumb to index finger' },
            { value: 'hold', label: 'Space', title: 'Hold the space bar' },
            { value: 'always', label: 'Always', title: 'Ink whenever a hand is tracked' },
          ]}
        />
        <p className="text-[11px] leading-relaxed text-mute">
          {{
            height: 'Ink flows while your fingertip sits within the green band below the desk line.',
            pinch: 'Touch thumb to index to write. Palm-normalized, so depth changes are fine.',
            hold: 'Hold Space to write — handy for checking the mapping without the side camera.',
            always: 'Ink whenever the hand is tracked inside the box. Good for testing the box fit.',
          }[settings.trigger]}
        </p>
      </Section>

      <Section
        title="Height thresholds"
        aside={<Button variant="ghost" onClick={onCalibrateDesk} disabled={!hasSideCamera}>Auto-set</Button>}
      >
        <div className={heightMode ? '' : 'pointer-events-none opacity-45'}>
          <Row label="Desk line" hint={settings.deskY.toFixed(3)}>
            <Slider value={settings.deskY} min={0.05} max={0.95} step={0.005}
              onChange={(deskY) => setSettings({ deskY })} />
          </Row>
          <Row label="Pen-down band" hint={settings.downT.toFixed(3)}>
            <Slider value={settings.downT} min={0.002} max={0.12} step={0.002}
              onChange={(downT) => setSettings({ downT })} />
          </Row>
          <Row label="Pen-up band" hint={settings.upT.toFixed(3)}>
            <Slider value={settings.upT} min={0.004} max={0.2} step={0.002}
              onChange={(upT) => setSettings({ upT })} />
          </Row>
          <p className="mt-1 text-[11px] leading-relaxed text-mute">
            The gap between the two bands is hysteresis — it stops the pen chattering when your
            finger rests near the threshold.
          </p>
        </div>
      </Section>

      <Section title="Page">
        <Row label="Size">
          <Select<PageSizeKey>
            value={settings.sizeKey}
            onChange={(sizeKey) => setSettings({ sizeKey })}
            options={Object.entries(PAGE_SIZES).map(([value, v]) => ({ value: value as PageSizeKey, label: v.label }))}
          />
        </Row>
        <Row label="Paper">
          <Segmented<Paper>
            value={settings.paper}
            onChange={(paper) => setSettings({ paper })}
            options={[
              { value: 'ruled', label: 'Ruled' },
              { value: 'grid', label: 'Grid' },
              { value: 'blank', label: 'Blank' },
            ]}
          />
        </Row>
        <Row label="Margin crop" hint={`${(settings.crop * 100).toFixed(1)}%`}>
          <Slider value={settings.crop} min={0} max={0.15} step={0.005}
            onChange={(crop) => setSettings({ crop })} />
        </Row>
      </Section>

      <Section title="Ink">
        <Row label="Colour"><Swatches value={settings.color} onChange={(color) => setSettings({ color })} /></Row>
        <Row label="Width" hint={`${settings.width.toFixed(1)} mm`}>
          <Slider value={settings.width} min={0.4} max={6} step={0.1} onChange={(width) => setSettings({ width })} />
        </Row>
        <Row label="Smoothing" hint={settings.smoothing.toFixed(2)}>
          <Slider value={settings.smoothing} min={0} max={1} step={0.02}
            onChange={(smoothing) => setSettings({ smoothing })} />
        </Row>
      </Section>

      <Section title="Tracking">
        <Row label="Min confidence" hint={settings.confidence.toFixed(2)}>
          <Slider value={settings.confidence} min={0.1} max={0.9} step={0.05}
            onChange={(confidence) => setSettings({ confidence })} />
        </Row>
        <Toggle label="Show hand skeleton" checked={settings.showSkeleton}
          onChange={(showSkeleton) => setSettings({ showSkeleton })} />
      </Section>
    </div>
  );
}
