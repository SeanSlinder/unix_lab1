# Makefile для модуля ядра Linux (ТГУ лабораторная работа)
# Компиляция main.c -> main.ko

obj-m += main.o

KDIR := /lib/modules/$(shell uname -r)/build
PWD  := $(shell pwd)

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean

# Дополнительные цели для удобства
install:
	sudo insmod main.ko

remove:
	sudo rmmod main

info:
	modinfo main.ko

test: install
	cat /proc/tsulab
	$(MAKE) remove
