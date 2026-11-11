#!/bin/sh
# Watch all free GPIOs for DURATION seconds and log every pin whose value changes
# (used to find which GPIO a button is wired to). Usage: gpio-watch.sh [seconds]
DURATION=${1:-60}
BASE=$(cat /sys/class/gpio/gpiochip*/base | head -1)
LOG=/tmp/gpio-watch.log
: > $LOG
for n in $(seq 0 47); do echo $((BASE + n)) > /sys/class/gpio/export 2>/dev/null; done

[ -f /sys/kernel/debug/gpio ] || mount -t debugfs none /sys/kernel/debug 2>/dev/null
snap() {
  for d in /sys/class/gpio/gpio[0-9]*; do echo "${d##*gpio}=$(cat $d/value 2>/dev/null)"; done
  # pins already claimed by drivers (gpio-keys...) are not exportable: read them from debugfs
  sed -nE 's/^ (gpio-[0-9]+) \(.*\|([a-z0-9_-]+) *\) (in|out) +(hi|lo).*/\1(\2)=\4/p' /sys/kernel/debug/gpio 2>/dev/null
}

snap > /tmp/gw.prev
end=$(( $(date +%s) + DURATION ))
while [ "$(date +%s)" -lt "$end" ]; do
  snap > /tmp/gw.cur
  grep -v -x -F -f /tmp/gw.prev /tmp/gw.cur | while read kv; do echo "$(date +%T) $kv" >> $LOG; done
  mv /tmp/gw.cur /tmp/gw.prev
done
for d in /sys/class/gpio/gpio[0-9]*; do echo "${d##*gpio}" > /sys/class/gpio/unexport 2>/dev/null; done
echo "WATCH_DONE" >> $LOG
