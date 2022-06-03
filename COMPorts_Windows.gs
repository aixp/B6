/*
	Alexander Shiryaev, 2021.05, 2022.02, 2022.06

	IMPLEMENTATION NOTES:
		write blocking
		read and auto re-open on timer (GLib)
*/

uses GLib

uses COMPorts0

namespace COMTPorts

	const private TRACE: bool = false

	enum private State
		INIT
		OPEN
		CLOSED

	const private TIMER_INTERVAL_MS: int = 50

	const private IN_BUF_LEN: int = 1024

	struct OpenPar
		dev: string
		baud: COMPorts0.Baud
		parity: COMPorts0.Parity

	delegate Receive (a: array of uchar)

	delegate OnOpen (p: Port)
	delegate OnClose (p: Port)

	struct Notifiers
		onOpen: unowned OnOpen
		onClose: unowned OnClose

	def bufRepr (a: array of uchar): string
		s: string
		if a.length > 0
			s = (a[0]).to_string("$%02X")
			i: int = 1
			while i < a.length
				s = s + " " + (a[i]).to_string("$%02X")
				i++
		else
			s = ""
		return s

	class Port
		state: private State

		fd: private FD

		timerStarted: private bool
		eventSourceIdTimer: private uint

		openPar: private OpenPar
		notifiers: private Notifiers
		receive: private unowned Receive

		construct (openPar: OpenPar, receive: Receive, notifiers: Notifiers, outBufLen: int)
			self.openPar = openPar
			self.notifiers = notifiers

			self.receive = receive

			self.state = State.INIT

			self.timerStarted = false

		def setOpenPar (openPar: OpenPar): bool
			res:bool = false
			case self.state
				when State.INIT,State.CLOSED
					self.openPar = openPar
					res = true
				when State.OPEN
					res = false
				default
					assert false
			return res

		def setReceive (receive: Receive)
			self.receive = receive

		def setNotifiers (notifiers: Notifiers)
			self.notifiers = notifiers

		def setOutBufLen (outBufLen: int)
			assert outBufLen >= 0
			pass

		def isOutBufEmpty (): bool
			return true

		def private close0 ()
			assert self.state == State.OPEN
			if self.notifiers.onClose != null
				self.notifiers.onClose(self)
			self.state = State.CLOSED
			COMPorts0.close(self.fd)

		def private read0 (a: array of char, out rd: int, out res: int)
			COMPorts0.read(self.fd, a, a.length, out rd, out res)

		def private processIn ()
			a: char[IN_BUF_LEN]
			res1: int
			res: int
			rd: int

			if self.state == State.CLOSED
				open(out res1)
			if self.state == State.OPEN
				read0(a, out rd, out res)
				if res == 0
					assert rd >= 0
					if rd > 0
						assert rd <= IN_BUF_LEN
						if self.receive != null
							self.receive((array of uchar)a[0:rd])
				else
					close0()
					/* open(out res1) */

		def private onTimer (): bool
			res: bool

			processIn()

			if self.timerStarted
				res = true
			else
				print("XXX: COMTPorts.OnTimer: timer not started")
				res = false

			return res

		def private startTimer ()
			if not self.timerStarted
				self.timerStarted = true
				self.eventSourceIdTimer = GLib.Timeout.add(TIMER_INTERVAL_MS, onTimer)

		def private stopTimer ()
			if self.timerStarted
				self.timerStarted = false
				GLib.Source.remove(self.eventSourceIdTimer)

		def open (out res: int)
			case self.state
				when State.INIT,State.CLOSED
					COMPorts0.open(self.openPar.dev, self.openPar.baud, self.openPar.parity, out self.fd, out res)
					if res == 0
						self.state = State.OPEN
						if self.notifiers.onOpen != null
							self.notifiers.onOpen(self)
						startTimer()
					else
						res = res + 100
				when State.OPEN
					res = 0 /* already open */
				default
					res = -1
					assert false

		def private send0 (a: array of uchar, partial: bool): int
			len: int = 0

			if self.state == State.CLOSED
				res1: int
				open(out res1)

			if self.state == State.OPEN
				res: int
				wr: int
				COMPorts0.write(self.fd, a, a.length, out wr, out res)
				if res == 0
					len = wr
				else
					close0()

			return len

		def send (a: array of uchar): bool
			return send0(a, false) == a.length

		def sendPartial (a: array of uchar): int
			return send0(a, true)

		def close ()
			case self.state
				when State.INIT
					/* never opened */
					pass
				when State.OPEN
					stopTimer()
					if self.notifiers.onClose != null
						self.notifiers.onClose(self)
					self.state = State.INIT
					COMPorts0.close(self.fd)
				when State.CLOSED
					stopTimer()
					self.state = State.INIT
				default
					assert false

		final
			close()
