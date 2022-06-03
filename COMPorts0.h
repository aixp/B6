#ifndef __COMPORTS0_H__
#define __COMPORTS0_H__

#include <stdint.h>

typedef int64_t COMPORTS0_FD;

typedef int COMPORTS0_BAUD;

typedef enum 
{
	COMPORTS0_PARITY_NONE,
	COMPORTS0_PARITY_ODD,
	COMPORTS0_PARITY_EVEN
} COMPORTS0_Parity;

void COMPORTS0_Open (const char *dev, COMPORTS0_BAUD baud, COMPORTS0_Parity parity, COMPORTS0_FD *fd, int *res);
void COMPORTS0_Close (COMPORTS0_FD fd);
void COMPORTS0_Write (COMPORTS0_FD fd, const void *adr, int len, int *wr, int *res);
void COMPORTS0_Read (COMPORTS0_FD fd, void *adr, int len, int *rd, int *res);

#endif
