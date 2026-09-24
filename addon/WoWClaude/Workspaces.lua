-- Filesystem/session browser. All I/O goes through the existing pixel transport.
local OC = WoWOpenCode
local browser
local PAGE_SIZE = 10

local function Safe(text) return (tostring(text or ""):gsub("|", "¦")) end

local function Button(parent, text, width, click)
	local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
	b:SetSize(width, 24)
	b:SetText(text)
	b:SetScript("OnClick", click)
	return b
end

local function Render()
	local b = browser
	local data = b.data or {}
	local items = b.recentMode and b.recent or data.items or {}
	b.title:SetText(b.mode == "folders" and "Open a project folder" or "Resume an OpenCode session")
	b.path:SetText(data.path or OC.CurrentFolder())
	b.status:SetText(b.loading and "Loading…" or b.error or (#items == 0 and "Nothing here yet. Open a folder or create a session." or #items .. " entries · page " .. b.page .. "/" .. math.max(1, math.ceil(#items / PAGE_SIZE))))
	for i, row in ipairs(b.rows) do
		local item = items[(b.page - 1) * PAGE_SIZE + i]
		row:SetShown(item ~= nil and not b.loading and not b.error)
		if item then
			row:SetText(Safe(item.name))
			row.item = item
		end
	end
	b.open:SetShown(b.mode == "folders" and not b.loading and not b.error)
	b.up:SetShown(b.mode == "folders")
	b.recentButton:SetShown(b.mode == "folders")
end

local function Build()
	local b = CreateFrame("Frame", "WoWOpenCodeBrowser", UIParent, "BackdropTemplate")
	browser = b
	b:SetSize(600, 460)
	b:SetPoint("CENTER")
	b:SetFrameStrata("DIALOG")
	b:SetClampedToScreen(true)
	b:EnableMouse(true)
	b:SetMovable(true)
	b:RegisterForDrag("LeftButton")
	b:SetScript("OnDragStart", b.StartMoving)
	b:SetScript("OnDragStop", b.StopMovingOrSizing)
	b:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
	b:SetBackdropColor(0.04, 0.05, 0.07, 0.98)
	tinsert(UISpecialFrames, "WoWOpenCodeBrowser")
	local close = CreateFrame("Button", nil, b, "UIPanelCloseButton")
	close:SetPoint("TOPRIGHT", b, "TOPRIGHT", -4, -4)
	b.title = b:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
	b.title:SetPoint("TOPLEFT", b, "TOPLEFT", 18, -18)
	b.path = CreateFrame("EditBox", nil, b, "InputBoxTemplate")
	b.path:SetAutoFocus(false)
	b.path:SetSize(452, 26)
	b.path:SetPoint("TOPLEFT", b, "TOPLEFT", 22, -50)
	b.path:SetScript("OnEnterPressed", function(self) OC.Browse("folders", self:GetText()); self:ClearFocus() end)
	b.path:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
	local go = Button(b, "Go", 80, function() OC.Browse("folders", b.path:GetText()) end)
	go:SetPoint("LEFT", b.path, "RIGHT", 14, 0)
	b.up = Button(b, "Parent", 80, function() if b.data then OC.Browse("folders", b.data.parent) end end)
	b.up:SetPoint("TOPLEFT", b, "TOPLEFT", 18, -86)
	b.recentButton = Button(b, "Recent", 80, function() b.recentMode = not b.recentMode; b.page = 1; Render() end)
	b.recentButton:SetPoint("LEFT", b.up, "RIGHT", 6, 0)
	b.rows = {}
	for i = 1, PAGE_SIZE do
		local row = Button(b, "", 564, function(self)
			if b.mode == "folders" then OC.Browse("folders", self.item.value)
			else OC.OpenWorkspace(b.data.path, self.item.value); b:Hide() end
		end)
		row:SetPoint("TOPLEFT", b, "TOPLEFT", 18, -120 - (i - 1) * 26)
		row:SetScript("OnEnter", function(self)
			GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
			GameTooltip:SetText(Safe(self.item.name))
			GameTooltip:AddLine(Safe(self.item.value), 0.7, 0.7, 0.7, true)
			GameTooltip:Show()
		end)
		row:SetScript("OnLeave", function() GameTooltip:Hide() end)
		b.rows[i] = row
	end
	b.open = Button(b, "Open this folder", 170, function() OC.OpenWorkspace(b.data.path); b:Hide() end)
	b.open:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -18, 42)
	local previous = Button(b, "Previous", 86, function() b.page = math.max(1, b.page - 1); Render() end)
	previous:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 18, 42)
	local nextPage = Button(b, "Next", 80, function()
		local items = b.recentMode and b.recent or b.data and b.data.items or {}
		b.page = math.min(math.max(1, math.ceil(#items / PAGE_SIZE)), b.page + 1); Render()
	end)
	nextPage:SetPoint("LEFT", previous, "RIGHT", 6, 0)
	b.status = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	b.status:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 18, 18)
	b.status:SetWidth(564)
	b.status:SetJustifyH("LEFT")
end

function OC.Browse(mode, folder)
	if not browser then Build() end
	local b = browser
	b.mode, b.page, b.loading, b.error, b.recentMode = mode, 1, true, nil, false
	b.recent = b.recent or {}
	b.request = OC.Control(mode, folder or OC.CurrentFolder())
	Render()
	b:Show()
end

function OC.BrowserResult(result)
	if not browser or result.id ~= browser.request then return end
	browser.loading, browser.error = false, result.error
	if not result.error then
		browser.data = result
		browser.recent = {}
		for _, folder in ipairs(result.recent or {}) do table.insert(browser.recent, { name = folder, value = folder }) end
	end
	Render()
end
