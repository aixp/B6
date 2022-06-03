/*
	Alexander Shiryaev, 2022.06
*/

uses Gtk
uses Gdk

uses COMPorts

namespace B6

	struct Decoder

		s: int
		buf: uchar[74]
		w: int

		def put (x: uchar): bool
			res: bool = false
			if s == 0
				if x == '{'
					w = 0
					s = 1
			else if s == 1
				if w < 72
					if x >= 128
						buf[w] = x - 128
						w += 1
					else
						s = 0
				else if w < 74
					buf[w] = x
					w += 1
				else if x == '}'
					res = true
					s = 0
				else
					s = 0
			return res

		def reset ()
			s = 0

		construct ()
			reset()

	enum Mode
		Config
		Li
		NiMH
		NiCd
		Pb
		Save
		Load

	def modeRepr (mode: Mode): string
		res: string
		case mode
			when Mode.Config
				res = "Config"
			when Mode.Li
				res = "Li"
			when Mode.NiMH
				res = "NiMH"
			when Mode.NiCd
				res = "NiCd"
			when Mode.Pb
				res = "Pb"
			when Mode.Save
				res = "Save"
			when Mode.Load
				res = "Load"
			default
				res = ((int)mode).to_string()
		return res

	[GtkTemplate (ui = "/B6.ui")]
	class B6: Gtk.ApplicationWindow
		[GtkChild]
		label_msg_counter: unowned Gtk.Label
		[GtkChild]
		label_mode: unowned Gtk.Label
		[GtkChild]
		label_running_state: unowned Gtk.Label
		[GtkChild]
		label_state: unowned Gtk.Label
		[GtkChild]
		grid_cycle: unowned Gtk.Grid
		[GtkChild]
		label_cycle_mode: unowned Gtk.Label
		[GtkChild]
		label_cycle_count: unowned Gtk.Label
		[GtkChild]
		label_cycle_waste_time: unowned Gtk.Label

		[GtkChild]
		label_opt0_key: unowned Gtk.Label
		[GtkChild]
		label_opt0_val: unowned Gtk.Label
		[GtkChild]
		label_opt0_unit: unowned Gtk.Label
		[GtkChild]
		label_opt1_key: unowned Gtk.Label
		[GtkChild]
		label_opt1_val: unowned Gtk.Label
		[GtkChild]
		label_opt1_unit: unowned Gtk.Label
		[GtkChild]
		label_opt2_key: unowned Gtk.Label
		[GtkChild]
		box_opt2: unowned Gtk.Box
		[GtkChild]
		label_opt_0: unowned Gtk.Label
		[GtkChild]
		label_opt_1: unowned Gtk.Label
		[GtkChild]
		label_opt_2: unowned Gtk.Label
		[GtkChild]
		label_opt_3: unowned Gtk.Label
		[GtkChild]
		label_opt_4: unowned Gtk.Label
		[GtkChild]
		label_opt_5: unowned Gtk.Label

		[GtkChild]
		label_actual_current: unowned Gtk.Label
		[GtkChild]
		label_actual_voltage: unowned Gtk.Label
		[GtkChild]
		label_input_voltage: unowned Gtk.Label
		[GtkChild]
		label_capacity: unowned Gtk.Label
		[GtkChild]
		label_time: unowned Gtk.Label

		[GtkChild]
		label_safety_timer_key: unowned Gtk.Label
		[GtkChild]
		label_safety_timer: unowned Gtk.Label
		[GtkChild]
		label_safety_timer_unit: unowned Gtk.Label
		[GtkChild]
		label_capacity_cutoff_key: unowned Gtk.Label
		[GtkChild]
		label_capacity_cutoff: unowned Gtk.Label
		[GtkChild]
		label_capacity_cutoff_unit: unowned Gtk.Label

		[GtkChild]
		checkButton_save: unowned Gtk.CheckButton
		[GtkChild]
		label_save_fileName: unowned Gtk.Label

		msgCounter: int

		port: COMPorts.Port
		d: Decoder
		os: GLib.FileOutputStream
		fileIndex: int

		aPrevAssigned: bool
		aPrev: uchar[72]
		runningStatePrev: bool

		def private load_icon ()
			icon: Gdk.Pixbuf
			try
				icon = new Gdk.Pixbuf.from_resource("/B6.svg")
			except
				print("WARNING: B6: icon load failed")
				icon = null
			if icon != null
				self.set_icon(icon)

		def private show_diff (x: array of uchar, y: array of uchar)
			assert x.length == y.length
			i: int = 0
			n: int = 0
			while i < x.length
				if i == 0
					if (x[i] & 0xe1) != (y[i] & 0xe1)
						print("%d: %d -> %d", i, x[i], y[i])
						n += 1
				else if (i == 4)
					pass
				else if (i == 6)
					pass
				else if i == 7
					if (x[i] & 0xfe) != (y[i] & 0xfe)
						print("%d: %d -> %d", i, x[i], y[i])
						n += 1
				else if (i == 8) or (i == 9)
					pass
				else if (i == 12) or (i == 13)
					pass
				else if (i >= 16) and (i <= 22)
					pass
				else if i == 23
					if (x[i] & 0xfe) != (y[i] & 0xfe)
						print("%d: %d -> %d", i, x[i], y[i])
						n += 1
				else if (i >= 29) and (i <= 35)
					pass
				else if (i >= 40) and (i <= 55)
					pass
				else if (i == 68) or (i == 69)
					pass
				else if x[i] != y[i]
					print("%d: %d -> %d", i, x[i], y[i])
					n += 1
				i += 1
			if n > 0
				print("============================================================")

		def private msg_received (a: array of uchar)
			assert a.length == 72

			if aPrevAssigned
				show_diff(aPrev, a)

			msgCounter += 1
			label_msg_counter.set_label(msgCounter.to_string())

			safetyTimerEnabled: bool = ((a[0] >> 1) & 1) == 1
			capCutOffEnabled: bool = ((a[0] >> 2) & 1) == 1
			keyBeepEnabled: bool = ((a[0] >> 3) & 1) == 1
			buzzerEnabled: bool = ((a[0] >> 4) & 1) == 1

			chgDChgWasteTimeMin: int = a[4]
			inputPowerLowCutOffDV: int = a[6]

			mode: Mode = (Mode)a[22]
			label_mode.set_label(modeRepr(mode))

			runningState: bool = (a[23] & 1) == 1
			if runningState
				label_running_state.set_label("<span background='yellow'>" + _("running") + "</span>")
			else
				if runningStatePrev
					self.file_close()
				label_running_state.set_label(_("standby"))

			state: int = a[7]
			charging: bool = (state & 1) == 1
			cycling: bool = ((state >> 4) & 1) == 1
			if charging
				label_state.set_label(_("charging"))
			else
				label_state.set_label(_("discharging"))
			if cycling
				grid_cycle.set_visible(true)
				cycleMode: int = a[14] & 1
				if cycleMode == 0
					label_cycle_mode.set_label(_("discharge") + " → " + _("charge"))
				else
					label_cycle_mode.set_label(_("charge") + " → " + _("discharge"))
				cycleCount: int = a[15]
				label_cycle_count.set_label(cycleCount.to_string())
				label_cycle_waste_time.set_label(chgDChgWasteTimeMin.to_string())
			else
				grid_cycle.set_visible(false)

			actualCurrentA: int = a[32]
			actualCurrentCA: int = a[33]
			actualVoltageV: int = a[34]
			actualVoltageCV: int = a[35]
			inputVoltageV: int = a[40]
			inputVoltageCV: int = a[41]
			capDAH: int = a[42]
			capMAH: int = a[43]

			label_actual_current.set_label("%d.%02d".printf(actualCurrentA, actualCurrentCA))
			label_actual_voltage.set_label("%d.%02d".printf(actualVoltageV, actualVoltageCV))
			label_input_voltage.set_label("%d.%02d".printf(inputVoltageV, inputVoltageCV))
			label_capacity.set_label((capDAH * 100 + capMAH).to_string())

			timeHMin: int = a[68]
			timeMin: int = a[69]
			label_time.set_label((timeHMin * 100 + timeMin).to_string())

			case mode
				when Mode.NiCd
					NiCdChargeCurrentDA: int = a[8]
					NiCdDischargeCurrentDA: int = a[9]
					// NiCdDischargeVoltageDAVCV: int = xx[26], xx[27]

					label_opt0_key.set_visible(false)
					label_opt0_val.set_visible(false)
					label_opt0_unit.set_visible(false)
					label_opt1_key.set_visible(false)
					label_opt1_val.set_visible(false)
					label_opt1_unit.set_visible(false)
					label_opt2_key.set_visible(false)
					box_opt2.set_visible(false)
				when Mode.NiMH
					NiMHChargeCurrentDA: int = a[12]
					NiMHDischargeCurrentDA: int = a[13]
					// NiMHDischargeVoltageDAVCV = xx[24], xx[25]

					label_opt0_key.set_visible(false)
					label_opt0_val.set_visible(false)
					label_opt0_unit.set_visible(false)
					label_opt1_key.set_visible(false)
					label_opt1_val.set_visible(false)
					label_opt1_unit.set_visible(false)
					label_opt2_key.set_visible(false)
					box_opt2.set_visible(false)
				when Mode.Li
					LiChargeCurrentDA: int = a[16]
					LiChargeCellCount: int = a[17]
					LiDischargeCurrentDA: int = a[18]
					LiDischargeCellCount: int = a[19]

					if charging
						label_opt0_key.set_label(modeRepr(mode) + ": " + _("charge current"))
						label_opt0_val.set_label("%d.%d".printf(LiChargeCurrentDA / 10, LiChargeCurrentDA % 10))
						label_opt0_unit.set_label(_("A"))

						label_opt1_key.set_label(modeRepr(mode) + ": " + _("charge cell count"))
						label_opt1_val.set_label(LiChargeCellCount.to_string())
					else
						label_opt0_key.set_label(modeRepr(mode) + ": " + _("discharge current"))
						label_opt0_val.set_label("%d.%d".printf(LiDischargeCurrentDA / 10, LiDischargeCurrentDA % 10))
						label_opt0_unit.set_label(_("A"))

						label_opt1_key.set_label(modeRepr(mode) + ": " + _("discharge cell count"))
						label_opt1_val.set_label(LiDischargeCellCount.to_string())

					label_opt2_key.set_label(modeRepr(mode) + ": " + _("cells voltages"))

					Li0V: int = a[44]
					Li0CV: int = a[45]
					Li1V: int = a[46]
					Li1CV: int = a[47]
					Li2V: int = a[48]
					Li2CV: int = a[49]
					Li3V: int = a[50]
					Li3CV: int = a[51]
					Li4V: int = a[52]
					Li4CV: int = a[53]
					Li5V: int = a[54]
					Li5CV: int = a[55]

					label_opt_0.set_label("%d.%02d".printf(Li0V, Li0CV))
					label_opt_1.set_label("%d.%02d".printf(Li1V, Li1CV))
					label_opt_2.set_label("%d.%02d".printf(Li2V, Li2CV))
					label_opt_3.set_label("%d.%02d".printf(Li3V, Li3CV))
					label_opt_4.set_label("%d.%02d".printf(Li4V, Li4CV))
					label_opt_5.set_label("%d.%02d".printf(Li5V, Li5CV))

					label_opt0_key.set_visible(true)
					label_opt0_val.set_visible(true)
					label_opt0_unit.set_visible(true)
					label_opt1_key.set_visible(true)
					label_opt1_val.set_visible(true)
					label_opt1_unit.set_visible(false)
					label_opt2_key.set_visible(true)
					box_opt2.set_visible(true)

					if runningState
						if self.os == null
							if checkButton_save.get_active()
								self.file_open_next()
						if self.os != null
							s: string = "%d,%d.%02d,%d.%02d,%d.%02d,%d,%d.%02d,%d.%02d,%d.%02d,%d.%02d,%d.%02d,%d.%02d\n".printf(
								timeHMin * 100 + timeMin,
								inputVoltageV, inputVoltageCV,
								actualVoltageV, actualVoltageCV,
								actualCurrentA, actualCurrentCA,
								capDAH * 100 + capMAH,
								Li0V, Li0CV, Li1V, Li1CV, Li2V, Li2CV, Li3V, Li3CV, Li4V, Li4CV, Li5V, Li5CV
							)
							try
								self.os.write(s.data)
							except e: Error
								self.file_close()
								checkButton_save.set_active(false)
								label_save_fileName.set_label("<span background='yellow'>" + _("file write error") + "</span>")
								label_save_fileName.set_visible(true)
				when Mode.Pb
					PbChargeCurrentDA: int = a[20]
					PbCellCount: int = a[21]

					label_opt0_key.set_visible(false)
					label_opt0_val.set_visible(false)
					label_opt0_unit.set_visible(false)
					label_opt1_key.set_visible(false)
					label_opt1_val.set_visible(false)
					label_opt1_unit.set_visible(false)
					label_opt2_key.set_visible(false)
					box_opt2.set_visible(false)
				default
					label_opt0_key.set_visible(false)
					label_opt0_val.set_visible(false)
					label_opt0_unit.set_visible(false)
					label_opt1_key.set_visible(false)
					label_opt1_val.set_visible(false)
					label_opt1_unit.set_visible(false)
					label_opt2_key.set_visible(false)
					box_opt2.set_visible(false)

			if safetyTimerEnabled
				safetyTimerMin: int = a[29] * 10
				label_safety_timer.set_label(safetyTimerMin.to_string())
				label_safety_timer_key.set_visible(true)
				label_safety_timer.set_visible(true)
				label_safety_timer_unit.set_visible(true)
			else
				label_safety_timer_key.set_visible(false)
				label_safety_timer.set_visible(false)
				label_safety_timer_unit.set_visible(false)

			if capCutOffEnabled
				/*
				capCutOffMAH: int = a[30] * 100 + a[31]
				label_capacity_cutoff.set_label(capCutOffMAH.to_string())
				label_capacity_cutoff_key.set_visible(true)
				label_capacity_cutoff.set_visible(true)
				label_capacity_cutoff_unit.set_visible(true)
				*/

				label_capacity_cutoff.set_label(_("enabled"))
				label_capacity_cutoff_key.set_visible(true)
				label_capacity_cutoff.set_visible(true)
				label_capacity_cutoff_unit.set_visible(false)
			else
				label_capacity_cutoff_key.set_visible(false)
				label_capacity_cutoff.set_visible(false)
				label_capacity_cutoff_unit.set_visible(false)

			aPrev = a[0:72]
			aPrevAssigned = true
			runningStatePrev = runningState

		def private receive (a: array of uchar)
			// print("%s", bufRepr(a))
			for x in a
				if d.put(x)
					msg_received(d.buf[0:72])

		def private on_port_open ()
			pass

		def private on_port_close ()
			pass

		def private file_open_next ()
			if self.os != null
				self.os = null

			fileName: string = "log-%08d.csv".printf(self.fileIndex)
			while GLib.FileUtils.test(fileName, GLib.FileTest.EXISTS)
				self.fileIndex += 1
				fileName = "log-%08d.csv".printf(self.fileIndex)

			file: GLib.File = GLib.File.new_for_path(fileName)
			try
				self.os = file.create(GLib.FileCreateFlags.NONE)
			except e: Error
				self.os = null
			if self.os == null
				label_save_fileName.set_label("<span background='yellow'>" + _("file create error") + "</span>")

			if self.os != null
				/* write header */
				s: string = "time_min,input_voltage,actual_voltage,actual_current,capacity_mAh,Li0,Li1,Li2,Li3,Li4,Li5\n"
				try
					self.os.write(s.data)
				except e: Error
					self.os = null
				if self.os == null
					label_save_fileName.set_label("<span background='yellow'>" + _("file write error") + "</span>")

			if self.os != null
				label_save_fileName.set_label(fileName)
			else
				checkButton_save.set_active(false)

			label_save_fileName.set_visible(true)

		def private file_close ()
			if self.os != null
				self.os = null
				if self.label_save_fileName != null
					label_save_fileName.set_visible(false)

		[GtkCallback]
		def private on_checkButton_save_toggled ()
			if not checkButton_save.get_active()
				self.file_close()

		construct (dev: string)
			aPrevAssigned = false
			runningStatePrev = false

			self.port = new COMPorts.Port(
				COMPorts.OpenPar(){
					dev = dev,
					baud = 9600,
					parity = COMPorts0.Parity.NONE
				},
				receive,
				COMPorts.Notifiers(){
					onOpen = on_port_open,
					onClose = on_port_close
				},
				16
			)
			res: int
			self.port.open(out res)
			if res != 0
				print("port open failed: %d", res)
			d = Decoder()

			self.os = null
			self.fileIndex = 0

			msgCounter = 0
			label_msg_counter.set_label(msgCounter.to_string())

			load_icon()
			self.show()

		final
			self.file_close()

	b6: B6

	def init (dev: string)
		b6 = new B6(dev)

	def close ()
		b6.destroy()
		b6 = null
