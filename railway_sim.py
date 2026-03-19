import pygame
import math
import random
import sys

# Initialize Pygame
pygame.init()
WIDTH, HEIGHT = 1100, 800  # Wider for the side panel
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Detailed Railway Network Simulator")
clock = pygame.time.Clock()

# Colors
BG_COLOR = (248, 250, 252) 
TEXT_COLOR = (30, 41, 59)
RED_LINE = (220, 38, 38)
BLUE_LINE = (37, 99, 235)
TRANSFER_COLOR = (147, 51, 234)
TRACK_DARK = (15, 23, 42)
STATION_COLOR = (255, 255, 255)
UI_BG = (241, 245, 249)

TRAIN_NORM = (16, 185, 129)  
TRAIN_WAIT = (239, 68, 68)   
TRAIN_BOARD = (234, 179, 8)  

# Fonts
font = pygame.font.SysFont('Arial', 14, bold=True)
small_font = pygame.font.SysFont('Arial', 11, bold=True)
panel_font_title = pygame.font.SysFont('Arial', 18, bold=True)
panel_font_text = pygame.font.SysFont('Arial', 13)
title_font = pygame.font.SysFont('Arial', 24, bold=True)

# Network Topology Nodes mapping: { id: (x, y, name, type, line_color) }
NODES = {
    'R1': (100, 400, 'West Depot', 'depot', RED_LINE),
    'R2': (300, 400, 'University', 'station', RED_LINE),
    'Central': (500, 400, 'Central Junction', 'station', TRANSFER_COLOR),
    'R3': (700, 400, 'Financial District', 'station', RED_LINE),
    'R4': (900, 400, 'East Depot', 'depot', RED_LINE),
    
    'B1': (500, 100, 'North Terminal', 'depot', BLUE_LINE),
    'B2': (500, 250, 'Market St', 'station', BLUE_LINE),
    'B3': (500, 550, 'South Blvd', 'station', BLUE_LINE),
    'B4': (500, 700, 'South Depot', 'depot', BLUE_LINE),
}

# Bounding boxes for station click detection
node_rects = {}

class TrackEdge:
    def __init__(self, u, v, line_color):
        self.u = u
        self.v = v
        self.line_color = line_color
        self.occupant = None 

EDGES = [
    TrackEdge('R1', 'R2', RED_LINE),
    TrackEdge('R2', 'Central', RED_LINE),
    TrackEdge('Central', 'R3', RED_LINE),
    TrackEdge('R3', 'R4', RED_LINE),
    TrackEdge('R4', 'R3', RED_LINE),
    TrackEdge('R3', 'Central', RED_LINE),
    TrackEdge('Central', 'R2', RED_LINE),
    TrackEdge('R2', 'R1', RED_LINE),
    
    TrackEdge('B1', 'B2', BLUE_LINE),
    TrackEdge('B2', 'Central', BLUE_LINE),
    TrackEdge('Central', 'B3', BLUE_LINE),
    TrackEdge('B3', 'B4', BLUE_LINE),
    TrackEdge('B4', 'B3', BLUE_LINE),
    TrackEdge('B3', 'Central', BLUE_LINE),
    TrackEdge('Central', 'B2', BLUE_LINE),
    TrackEdge('B2', 'B1', BLUE_LINE),
]

class Passenger:
    def __init__(self, p_id, origin, destination):
        self.id = p_id
        self.origin = origin
        self.destination = destination
        self.wait_time = 0.0

class Train:
    def __init__(self, t_id, line, path):
        self.id = t_id
        self.line = line
        self.path = path  
        self.path_index = 0
        self.current_node = self.path[0]
        self.next_node = self.path[1]
        self.progress = 0.0
        self.status = 'boarding'
        self.timer = 60 
        self.capacity = 30
        self.passengers = []
        
    def get_current_edge(self):
        for e in EDGES:
            if e.u == self.current_node and e.v == self.next_node:
                return e
        return None

# Initialization
# station_passengers: { node_id: [Passenger, ...] }
station_passengers = {n: [] for n, info in NODES.items() if info[3] == 'station'}
passenger_counter = 0

trains = [
    Train('T101', 'Red', ['R1', 'R2', 'Central', 'R3', 'R4']),
    Train('T102', 'Red', ['R4', 'R3', 'Central', 'R2', 'R1']),
    Train('T103', 'Red', ['Central', 'R3', 'R4', 'R3', 'Central', 'R2', 'R1', 'R2', 'Central']),
    Train('T201', 'Blue', ['B1', 'B2', 'Central', 'B3', 'B4']),
    Train('T202', 'Blue', ['B4', 'B3', 'Central', 'B2', 'B1']),
]

sim_time = 420.0 
sim_speed = 1.0   # Multiplier: 0=Pause, 1=Realtime slow, 5=Fast
selected_station = None

def draw_track(surface, color, p1, p2, offset_dist):
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = math.hypot(dx, dy)
    if length == 0: return
    nx, ny = -dy/length, dx/length
    
    op1 = (p1[0] + nx * offset_dist, p1[1] + ny * offset_dist)
    op2 = (p2[0] + nx * offset_dist, p2[1] + ny * offset_dist)
    pygame.draw.line(surface, color, op1, op2, 4)
    pygame.draw.line(surface, TRACK_DARK, op1, op2, 2)

class Button:
    def __init__(self, text, x, y, width, height, bg_color, hover_color):
        self.rect = pygame.Rect(x, y, width, height)
        self.text = text
        self.bg_color = bg_color
        self.hover_color = hover_color
        
    def draw(self, surface, mouse_pos):
        color = self.hover_color if self.rect.collidepoint(mouse_pos) else self.bg_color
        pygame.draw.rect(surface, color, self.rect, border_radius=5)
        pygame.draw.rect(surface, TRACK_DARK, self.rect, 1, border_radius=5)
        lbl = font.render(self.text, True, TEXT_COLOR)
        surface.blit(lbl, (self.rect.centerx - lbl.get_width()//2, self.rect.centery - lbl.get_height()//2))

buttons = [
    Button("Pause", 20, HEIGHT - 60, 70, 40, (226, 232, 240), (203, 213, 225)),
    Button("1x", 100, HEIGHT - 60, 50, 40, (226, 232, 240), (203, 213, 225)),
    Button("2x", 160, HEIGHT - 60, 50, 40, (226, 232, 240), (203, 213, 225)),
    Button("5x", 220, HEIGHT - 60, 50, 40, (226, 232, 240), (203, 213, 225)),
]

def generate_demand(delta_t):
    global passenger_counter
    hour = (sim_time // 60)
    peak_multiplier = 4 if (7 <= hour <= 9) or (17 <= hour <= 19) else 1
    
    # Base chance scales with delta_t (sim_speed)
    chance = 0.05 * peak_multiplier * delta_t
    
    if random.random() < chance:
        o = random.choice(list(station_passengers.keys()))
        possible_dests = [s for s in station_passengers.keys() if s != o]
        d = random.choice(possible_dests)
        num_spawning = random.randint(1, 3)
        for _ in range(num_spawning):
            passenger_counter += 1
            pid = f"P{passenger_counter:04d}"
            station_passengers[o].append(Passenger(pid, o, d))

def main():
    global sim_time, sim_speed, selected_station
    running = True

    while running:
        delta_t = 0.02 * sim_speed  # Extremely slow default (1 frame = 0.02 sim minutes)
        
        mouse_pos = pygame.mouse.get_pos()
        
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
                break
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                # Check station clicks
                clicked_station = False
                for node_id, rect in node_rects.items():
                    if rect.collidepoint(event.pos):
                        selected_station = node_id
                        clicked_station = True
                        break
                
                # Check button clicks
                for b in buttons:
                    if b.rect.collidepoint(event.pos):
                        if b.text == "Pause": sim_speed = 0.0
                        elif b.text == "1x": sim_speed = 1.0
                        elif b.text == "2x": sim_speed = 2.0
                        elif b.text == "5x": sim_speed = 5.0
                        clicked_station = True
                        
                # Close panel if clicked empty space
                if not clicked_station and event.pos[0] < WIDTH - 300:
                    selected_station = None

        if sim_speed > 0:
            sim_time += delta_t
            if sim_time >= 1440: sim_time = 0
            
            generate_demand(sim_speed)
            
            # Update passenger wait times
            for s, queue in station_passengers.items():
                for p in queue:
                    p.wait_time += delta_t
            
            # Train Update Logic
            for t in trains:
                edge = t.get_current_edge()
                
                if t.status == 'boarding':
                    # Timer is in absolute frames scaled by sim_speed to maintain physical time
                    t.timer -= sim_speed
                    if t.timer <= 0:
                        # Unload passengers heading to this station
                        t.passengers = [p for p in t.passengers if p.destination != t.current_node]
                        
                        # Board waiting passengers if at station
                        if t.current_node in station_passengers:
                            queue = station_passengers[t.current_node]
                            while queue and len(t.passengers) < t.capacity:
                                t.passengers.append(queue.pop(0))
                        
                        # Request block signal
                        if edge and edge.occupant in [None, t.id]:
                            edge.occupant = t.id
                            t.status = 'moving'
                        else:
                            t.status = 'waiting'
                            
                elif t.status == 'waiting':
                    if edge and edge.occupant is None:
                        edge.occupant = t.id
                        t.status = 'moving'
                        
                elif t.status == 'moving':
                    n1 = NODES[t.current_node]
                    n2 = NODES[t.next_node]
                    dist = math.hypot(n2[0]-n1[0], n2[1]-n1[1])
                    # Speed is very slow for observation
                    speed = 1.0 * sim_speed 
                    t.progress += speed / dist
                    
                    if t.progress >= 1.0:
                        t.progress = 0.0
                        t.current_node = t.next_node
                        
                        if edge and edge.occupant == t.id:
                            edge.occupant = None
                        
                        t.path_index += 1
                        if t.path_index >= len(t.path) - 1:
                            t.path.reverse()
                            t.path_index = 0
                            t.timer = 180 
                        else:
                            t.timer = 80 
                            
                        t.next_node = t.path[t.path_index + 1]
                        t.status = 'boarding'

        # Rendering
        screen.fill(BG_COLOR)
        node_rects.clear()
        
        # 1. Draw Edges
        for e in EDGES:
            n1 = NODES[e.u]
            n2 = NODES[e.v]
            draw_track(screen, e.line_color, (n1[0], n1[1]), (n2[0], n2[1]), 8)
            
        # 2. Draw Trains
        for t in trains:
            if t.status in ['boarding', 'waiting'] and t.progress == 0.0:
                n = NODES[t.current_node]
                x, y = n[0], n[1]
                edge = t.get_current_edge()
                if edge:
                    n1 = NODES[edge.u]
                    n2 = NODES[edge.v]
                    dx, dy = n2[0] - n1[0], n2[1] - n1[1]
                    length = math.hypot(dx, dy)
                    if length > 0:
                        nx, ny = -dy/length, dx/length
                        x += nx * 8
                        y += ny * 8
            else:
                n1 = NODES[t.current_node]
                n2 = NODES[t.next_node]
                dx, dy = n2[0] - n1[0], n2[1] - n1[1]
                length = math.hypot(dx, dy)
                if length > 0:
                    nx, ny = -dy/length, dx/length
                    x = n1[0] + dx * t.progress + nx * 8
                    y = n1[1] + dy * t.progress + ny * 8
            
            color = TRAIN_NORM if t.status == 'moving' else TRAIN_WAIT if t.status == 'waiting' else TRAIN_BOARD
            rect = pygame.Rect(x - 10, y - 6, 20, 12)
            pygame.draw.rect(screen, color, rect, border_radius=3)
            pygame.draw.rect(screen, TRACK_DARK, rect, 1, border_radius=3)
            
            # Show Passenger Fill level bar
            fill_ratio = len(t.passengers) / t.capacity
            pygame.draw.line(screen, (0,0,0), (x - 8, y + 4), (x + 8, y + 4), 2)
            if fill_ratio > 0:
                pygame.draw.line(screen, (255,255,255), (x - 8, y + 4), (x - 8 + 16*fill_ratio, y + 4), 2)
            
            tlbl = small_font.render(t.id, True, TRACK_DARK)
            screen.blit(tlbl, (x - 12, y - 18))

        # 3. Draw Nodes (Stations/Depots)
        for node_id, data in NODES.items():
            x, y, name, ntype, ncolor = data
            if ntype == 'transfer': ncolor = TRANSFER_COLOR
                
            pygame.draw.circle(screen, ncolor, (x, y), 16)
            pygame.draw.circle(screen, STATION_COLOR, (x, y), 12)
            
            # Hover highlight & Click Hitbox
            rect = pygame.Rect(x - 20, y - 20, 40, 40)
            node_rects[node_id] = rect
            if selected_station == node_id or rect.collidepoint(mouse_pos):
                pygame.draw.circle(screen, (0,0,0), (x, y), 18, 2)

            lbl = font.render(name, True, TEXT_COLOR)
            screen.blit(lbl, (x - lbl.get_width()//2, y + 22))
            
            if ntype == 'station':
                q_len = len(station_passengers.get(node_id, []))
                if q_len > 0:
                    dlbl = small_font.render(str(q_len), True, STATION_COLOR)
                    bg_rect = pygame.Rect(x + 10, y - 25, 20, 16)
                    pygame.draw.rect(screen, BLUE_LINE if q_len < 20 else RED_LINE, bg_rect, border_radius=8)
                    screen.blit(dlbl, (x + 15 - (4 if q_len > 9 else 0), y - 24))

        # 4. Main UI Overlay
        time_h, time_m = int(sim_time) // 60, int(sim_time) % 60
        pygame.draw.rect(screen, (255,255,255), (20, 20, 320, 100), border_radius=10)
        pygame.draw.rect(screen, TRACK_DARK, (20, 20, 320, 100), 2, border_radius=10)
        
        speed_str = "PAUSED" if sim_speed == 0 else f"{sim_speed}x"
        screen.blit(title_font.render(f"Sim Time: {time_h:02d}:{time_m:02d} [{speed_str}]", True, TEXT_COLOR), (40, 30))
        total_p = sum(len(q) for q in station_passengers.values())
        screen.blit(font.render(f"Global Passengers Waiting: {total_p}", True, TEXT_COLOR), (40, 65))
        
        for b in buttons: b.draw(screen, mouse_pos)

        # 5. Side Panel for Detailed Station View
        if selected_station and selected_station in NODES:
            s_data = NODES[selected_station]
            panel_rect = pygame.Rect(WIDTH - 300, 0, 300, HEIGHT)
            pygame.draw.rect(screen, UI_BG, panel_rect)
            pygame.draw.line(screen, TRACK_DARK, (WIDTH - 300, 0), (WIDTH - 300, HEIGHT), 2)
            
            # Title
            s_title = panel_font_title.render(f"{s_data[2]}", True, TEXT_COLOR)
            screen.blit(s_title, (WIDTH - 280, 20))
            
            # Approaching Trains
            screen.blit(font.render("Approaching Trains:", True, (100, 116, 139)), (WIDTH - 280, 60))
            y_offset = 80
            for t in trains:
                if t.next_node == selected_station and t.status == 'moving':
                    eta = int((1.0 - t.progress) * 10 / sim_speed) if sim_speed > 0 else "---"
                    screen.blit(panel_font_text.render(f"- {t.id} ({t.line} Line)  ETA {eta}s", True, TEXT_COLOR), (WIDTH - 280, y_offset))
                    y_offset += 20
            
            if y_offset == 80:
                screen.blit(panel_font_text.render("None currently.", True, TEXT_COLOR), (WIDTH - 280, y_offset))
                y_offset += 20
                
            # Passenger Details
            y_offset += 20
            queue = station_passengers.get(selected_station, [])
            screen.blit(font.render(f"Passenger Queue ({len(queue)} waiting):", True, (100, 116, 139)), (WIDTH - 280, y_offset))
            y_offset += 25
            
            if not queue:
                screen.blit(panel_font_text.render("Platform is empty.", True, TEXT_COLOR), (WIDTH - 280, y_offset))
            else:
                for i, p in enumerate(queue[:35]):
                    dest_name = NODES[p.destination][2]
                    screen.blit(panel_font_text.render(f"[{p.id}] To: {dest_name} (Wait: {int(p.wait_time)}m)", True, TEXT_COLOR), (WIDTH - 280, y_offset))
                    y_offset += 16
                if len(queue) > 35:
                    screen.blit(panel_font_text.render(f"... and {len(queue)-35} more", True, TEXT_COLOR), (WIDTH - 280, y_offset))

        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
