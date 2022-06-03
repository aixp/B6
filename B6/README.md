# B6 monitor

## About

IMAX B6 compatible chargers monitor

## Build

### Install build requirements

#### Ubuntu 22.04 LTS

	apt install valac libgtk-3-dev

#### Manjaro

	pacman -S python vala make gettext

#### OpenBSD

	pkg_add python vala gettext gtk+3

### Build

	cd B6 && ./mkmkfile.sh && make

## Run

	cd B6 && ./B6 DEVICE

DEVICE — path to terminal (serial) device (e.g. /dev/ttyUSB0)

## Charger configuration

USER SET PROGRAM → USB/Temp Select → USB Enable

## Charger connector pinout

| pin | description        |
| --- | ------------------ |
| 1   | +5V                |
| 2   | device UART output |
| 3   | GND                |

## UART settings

| parameter | value |
| --------- | ----- |
| baud rate | 9600  |
| parity    | none  |
