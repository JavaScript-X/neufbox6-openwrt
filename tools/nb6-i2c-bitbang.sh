#!/bin/sh
# Talk to the SFR Neufbox 6 LED/hwmon microcontroller (I2C 0x60, SDA=GPIO30, SCL=GPIO2) by
# bit-banging the GPIO lines from userspace. For testing only (slow); the real thing is the
# nb6-hwmon kernel driver.
#   nb6-i2c-bitbang.sh write <reg> <val>     e.g. write 0x31 11   (LED mode = manual control)
#   nb6-i2c-bitbang.sh read  <reg>
BASE=$(cat /sys/class/gpio/gpiochip*/base | head -1)
SDA=$((BASE + 30)); SCL=$((BASE + 2)); ADDR=0x60
G=/sys/class/gpio
for p in $SDA $SCL; do [ -d $G/gpio$p ] || echo $p > $G/export; done

# open drain: "low" = output 0, "high" = input (external pull-up)
sda_lo() { echo low > $G/gpio$SDA/direction; }
sda_hi() { echo in > $G/gpio$SDA/direction; }
scl_lo() { echo low > $G/gpio$SCL/direction; }
scl_hi() { echo in > $G/gpio$SCL/direction; n=0; while [ "$(cat $G/gpio$SCL/value)" = 0 ] && [ $n -lt 50 ]; do n=$((n+1)); done; }
sda_rd() { cat $G/gpio$SDA/value; }

start() { sda_hi; scl_hi; sda_lo; scl_lo; }
stop()  { sda_lo; scl_hi; sda_hi; }
wbyte() { # $1 = byte; prints ACK (0) / NACK (1)
  b=$1; i=7
  while [ $i -ge 0 ]; do
    if [ $(( (b >> i) & 1 )) = 1 ]; then sda_hi; else sda_lo; fi
    scl_hi; scl_lo; i=$((i-1))
  done
  sda_hi; scl_hi; a=$(sda_rd); scl_lo; echo $a
}
rbyte() { # $1 = 1 to ACK, 0 to NACK; prints byte
  sda_hi; v=0; i=7
  while [ $i -ge 0 ]; do scl_hi; v=$(( (v << 1) | $(sda_rd) )); scl_lo; i=$((i-1)); done
  if [ "$1" = 1 ]; then sda_lo; else sda_hi; fi; scl_hi; scl_lo; sda_hi; echo $v
}

case "$1" in
  write)
    start; a1=$(wbyte $((ADDR << 1))); a2=$(wbyte $(($2))); a3=$(wbyte $(($3))); stop
    echo "write reg=$2 val=$3 ack=$a1$a2$a3 (000 = OK)" ;;
  read)
    start; a1=$(wbyte $((ADDR << 1))); a2=$(wbyte $(($2)))
    start; a3=$(wbyte $(( (ADDR << 1) | 1 ))); v=$(rbyte 0); stop
    echo "read reg=$2 val=$v ack=$a1$a2$a3 (000 = OK)" ;;
  *) echo "usage: $0 write <reg> <val> | read <reg>"; exit 1 ;;
esac
